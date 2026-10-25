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
let targetId;
let deleteTargetId;
const createdStudentIds = [];
let adminToken;
let studentToken;

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
      `Admin Users ${label}`,
      `admin-users-${Date.now()}-${Math.random()}-${label}@example.invalid`,
      role,
    ]
  );
  return result.rows[0].id;
}

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  adminId = await insertUser("admin", "admin");
  studentId = await insertUser("student", "student");
  targetId = await insertUser("target", "instructor");
  deleteTargetId = await insertUser("delete", "student");
  adminToken = signToken(adminId);
  studentToken = signToken(studentId);

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
    const ids = [
      adminId,
      studentId,
      targetId,
      deleteTargetId,
      ...createdStudentIds,
    ].filter(Boolean);
    if (ids.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [ids]);
    }
  } finally {
    await pool.end();
  }
});

test("administrator user-management endpoints enforce permissions and persist changes", async (t) => {
  await t.test("public and administrator registration can create students only", async () => {
    const accountDetails = {
      full_name: "Managed Student",
      email: `managed-student-${Date.now()}@example.invalid`,
      password: "StrongPass1!",
      role: "admin",
    };

    assert.equal(
      (await request("/users/students", {
        method: "POST",
        body: accountDetails,
      })).status,
      401
    );
    assert.equal(
      (await request("/users/students", {
        token: studentToken,
        method: "POST",
        body: accountDetails,
      })).status,
      403
    );

    const managed = await request("/users/students", {
      token: adminToken,
      method: "POST",
      body: accountDetails,
    });
    assert.equal(managed.status, 201);
    assert.equal(managed.body.user.role, "student");
    createdStudentIds.push(managed.body.user.id);

    const publicRegistration = await request("/auth/register", {
      method: "POST",
      body: {
        full_name: "Self Registered Student",
        email: `self-registered-${Date.now()}@example.invalid`,
        password: "StrongPass1!",
        role: "instructor",
      },
    });
    assert.equal(publicRegistration.status, 201);
    assert.equal(publicRegistration.body.user.role, "student");
    createdStudentIds.push(publicRegistration.body.user.id);

    const publicInstructorCreation = await request("/auth/instructors", {
      method: "POST",
      body: accountDetails,
    });
    assert.equal(publicInstructorCreation.status, 401);
  });

  await t.test("only administrators may list recent users", async () => {
    assert.equal((await request("/users/recent")).status, 401);
    assert.equal(
      (await request("/users/recent", { token: studentToken })).status,
      403
    );
    const result = await request("/users/recent", { token: adminToken });
    assert.equal(result.status, 200);
    assert.ok(result.body.users.some((account) => String(account.id) === String(targetId)));
  });

  await t.test("administrators can edit profile fields but not account roles", async () => {
    const result = await request(`/users/${targetId}`, {
      token: adminToken,
      method: "PATCH",
      body: {
        full_name: "Updated Instructor Name",
        email: "updated-instructor@example.invalid",
        role: "admin",
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.full_name, "Updated Instructor Name");
    assert.equal(result.body.user.email, "updated-instructor@example.invalid");
    assert.equal(result.body.user.role, "instructor");

    const forbidden = await request(`/users/${targetId}`, {
      token: studentToken,
      method: "PATCH",
      body: {
        full_name: "Unauthorized Change",
        email: "unauthorized@example.invalid",
      },
    });
    assert.equal(forbidden.status, 403);
  });

  await t.test("activation changes persist and self-deactivation is refused", async () => {
    const deactivated = await request(`/users/${targetId}/status`, {
      token: adminToken,
      method: "PATCH",
      body: { is_active: false },
    });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.user.is_active, false);

    const disabledAccess = await request("/auth/me", {
      token: signToken(targetId),
    });
    assert.equal(disabledAccess.status, 401);

    const activated = await request(`/users/${targetId}/status`, {
      token: adminToken,
      method: "PATCH",
      body: { is_active: true },
    });
    assert.equal(activated.status, 200);
    assert.equal(activated.body.user.is_active, true);

    const selfDeactivation = await request(`/users/${adminId}/status`, {
      token: adminToken,
      method: "PATCH",
      body: { is_active: false },
    });
    assert.equal(selfDeactivation.status, 409);
  });

  await t.test("delete requires admin and removes an unreferenced account", async () => {
    const forbidden = await request(`/users/${deleteTargetId}`, {
      token: studentToken,
      method: "DELETE",
    });
    assert.equal(forbidden.status, 403);

    const deleted = await request(`/users/${deleteTargetId}`, {
      token: adminToken,
      method: "DELETE",
    });
    assert.equal(deleted.status, 200);
    deleteTargetId = null;
  });
});
