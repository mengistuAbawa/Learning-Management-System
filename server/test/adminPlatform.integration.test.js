require("dotenv").config();

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const { pool } = require("../src/config/db");

let server;
let baseUrl;
let adminId;
let studentId;
let instructorId;
let adminToken;
let studentToken;
let instructorToken;
let originalPlatformNameSetting;
let createdAnnouncementId;
let createdCategoryName;

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    issuer: "learnsphere-lms",
    audience: "learnsphere-lms-client",
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function insertUser(label, role) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, 'test-only', $3)
     RETURNING id`,
    [
      `Admin Platform ${label}`,
      `admin-platform-${Date.now()}-${Math.random()}-${label}@example.invalid`,
      role,
    ]
  );
  return result.rows[0].id;
}

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: ("Be" + "arer " + token) } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to at least 32 characters to run integration tests.");
  }

  const settingResult = await pool.query(
    `SELECT setting_value FROM platform_settings
     WHERE setting_key = 'platform_name'`
  );
  originalPlatformNameSetting = settingResult.rowCount
    ? settingResult.rows[0].setting_value
    : undefined;

  adminId = await insertUser("admin", "admin");
  studentId = await insertUser("student", "student");
  instructorId = await insertUser("instructor", "instructor");
  adminToken = signToken(adminId);
  studentToken = signToken(studentId);
  instructorToken = signToken(instructorId);

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (createdAnnouncementId) {
      await pool.query("DELETE FROM announcements WHERE id = $1", [createdAnnouncementId]);
    }
    if (createdCategoryName) {
      await pool.query("DELETE FROM course_categories WHERE name = $1", [createdCategoryName]);
    }
    if (originalPlatformNameSetting === undefined) {
      await pool.query(
        "DELETE FROM platform_settings WHERE setting_key = 'platform_name'"
      );
    } else {
      await pool.query(
        `UPDATE platform_settings
         SET setting_value = $1::jsonb
         WHERE setting_key = 'platform_name'`,
        [JSON.stringify(originalPlatformNameSetting)]
      );
    }
    const ids = [adminId, studentId, instructorId].filter(Boolean);
    if (ids.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [ids]);
    }
  } finally {
    await pool.end();
  }
});

test("administrator platform APIs enforce access and persist changes", async (t) => {
  await t.test("instructor applications remain pending until administrator approval", async () => {
    const email = `instructor-application-${Date.now()}@example.invalid`;
    const application = await request("/auth/instructors/apply", {
      method: "POST",
      body: {
        full_name: "Instructor Applicant",
        email,
        password: "StrongPass1!",
      },
    });
    assert.equal(application.status, 201);
    assert.equal(application.body.user.role, "instructor");
    assert.equal(application.body.user.approval_status, "pending");

    const pendingLogin = await request("/auth/login", {
      method: "POST",
      body: { email, password: "StrongPass1!" },
    });
    assert.equal(pendingLogin.status, 403);

    const pending = await request("/users/instructors/pending", {
      token: adminToken,
    });
    assert.equal(pending.status, 200);
    assert.ok(
      pending.body.instructors.some(
        (instructor) => String(instructor.id) === String(application.body.user.id)
      )
    );

    const approved = await request(
      `/users/instructors/${application.body.user.id}/approval`,
      {
        token: adminToken,
        method: "PATCH",
        body: { approval_status: "approved" },
      }
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.body.user.approval_status, "approved");

    const login = await request("/auth/login", {
      method: "POST",
      body: { email, password: "StrongPass1!" },
    });
    assert.equal(login.status, 200);
    await pool.query("DELETE FROM users WHERE id = $1", [application.body.user.id]);
  });

  await t.test("announcements are permissioned and filtered by audience", async () => {
    const denied = await request("/admin/announcements", {
      token: studentToken,
      method: "POST",
      body: {
        title: "Maintenance",
        message: "Platform maintenance tonight.",
        audience: "student",
        status: "published",
      },
    });
    assert.equal(denied.status, 403);

    const created = await request("/admin/announcements", {
      token: adminToken,
      method: "POST",
      body: {
        title: "Student notice",
        message: "New learning resources are available.",
        audience: "student",
        status: "published",
      },
    });
    assert.equal(created.status, 201);
    createdAnnouncementId = created.body.announcement.id;

    const studentFeed = await request("/admin/announcements/published", {
      token: studentToken,
    });
    assert.ok(
      studentFeed.body.announcements.some(
        (announcement) => String(announcement.id) === String(createdAnnouncementId)
      )
    );

    const instructorFeed = await request("/admin/announcements/published", {
      token: instructorToken,
    });
    assert.ok(
      !instructorFeed.body.announcements.some(
        (announcement) => String(announcement.id) === String(createdAnnouncementId)
      )
    );
  });

  await t.test("administrators can create, rename, and delete unused categories", async () => {
    const name = `Admin Test ${Date.now()}`;
    const created = await request("/courses/categories", {
      token: adminToken,
      method: "POST",
      body: { name },
    });
    assert.equal(created.status, 201);
    createdCategoryName = name;

    const renamedName = `${name} Renamed`;
    const renamed = await request(`/courses/categories/${encodeURIComponent(name)}`, {
      token: adminToken,
      method: "PUT",
      body: { name: renamedName },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.category.name, renamedName);
    createdCategoryName = renamedName;

    const deleted = await request(
      `/courses/categories/${encodeURIComponent(renamedName)}`,
      { token: adminToken, method: "DELETE" }
    );
    assert.equal(deleted.status, 200);
    createdCategoryName = null;
  });

  await t.test("settings, health, and audit endpoints enforce admin access", async () => {
    const setting = await request("/admin/settings/platform_name", {
      token: adminToken,
      method: "PUT",
      body: { value: "LearnSphere Test" },
    });
    assert.equal(setting.status, 200);

    const health = await request("/admin/health", { token: adminToken });
    assert.equal(health.status, 200);
    assert.equal(health.body.checks.database.status, "healthy");

    assert.equal((await request("/admin/audit-logs", { token: studentToken })).status, 403);
    const audit = await request("/admin/audit-logs", { token: adminToken });
    assert.equal(audit.status, 200);
    assert.ok(
      audit.body.logs.some(
        (entry) =>
          String(entry.actor_user_id) === String(adminId) &&
          entry.resource === "announcements"
      )
    );
  });

  await t.test("account directory exposes paginated account details only to admins", async () => {
    const denied = await request("/users/accounts?role=student", {
      token: studentToken,
    });
    assert.equal(denied.status, 403);

    const invalidRole = await request("/users/accounts?role=admin", {
      token: adminToken,
    });
    assert.equal(invalidRole.status, 400);

    const accounts = await request(
      "/users/accounts?role=student&limit=1&offset=0",
      { token: adminToken }
    );
    assert.equal(accounts.status, 200);
    assert.equal(accounts.body.users.length, 1);
    assert.equal(accounts.body.users[0].role, "student");
    assert.equal("password_hash" in accounts.body.users[0], false);
    assert.equal(accounts.body.pagination.limit, 1);
  });

  await t.test("localization settings accept supported languages and IANA time zones", async () => {
    const language = await request("/admin/settings/platform_language", {
      token: adminToken,
      method: "PUT",
      body: { value: "am" },
    });
    assert.equal(language.status, 200);
    assert.equal(language.body.setting.setting_value, "am");

    const timeZone = await request("/admin/settings/platform_timezone", {
      token: adminToken,
      method: "PUT",
      body: { value: "Africa/Addis_Ababa" },
    });
    assert.equal(timeZone.status, 200);
    assert.equal(timeZone.body.setting.setting_value, "Africa/Addis_Ababa");

    const invalidTimeZone = await request("/admin/settings/platform_timezone", {
      token: adminToken,
      method: "PUT",
      body: { value: "Not/A_Time_Zone" },
    });
    assert.equal(invalidTimeZone.status, 400);
  });
});
