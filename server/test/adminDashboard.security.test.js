require("dotenv").config();

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const { pool } = require("../src/config/db");

let server;
let baseUrl;
let ids = [];
let tokens = {};
let adminId;
let pendingInstructorId;
let studentId;
let courseId;
let enrollmentId;
let categoryName;
let announcementId;

async function createUser(role, label, approvalStatus = "approved") {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, approval_status)
     VALUES ($1, $2, 'test-only', $3, $4)
     RETURNING id`,
    [
      `Dashboard test ${label}`,
      `dashboard-${label}-${Date.now()}-${Math.random()}@example.invalid`,
      role,
      approvalStatus,
    ],
  );
  ids.push(result.rows[0].id);
  return result.rows[0].id;
}

function signToken(id) {
  return jwt.sign({ sub: String(id) }, process.env.JWT_SECRET, {
    issuer: "learnsphere-lms",
    audience: "learnsphere-lms-client",
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function request(path, { role = "admin", method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}),
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
  const adminResult = await pool.query(
    `SELECT id FROM users
     WHERE role = 'admin' AND is_active = TRUE AND approval_status = 'approved'
     ORDER BY id LIMIT 1`,
  );
  adminId = adminResult.rows[0]?.id || await createUser("admin", "admin");
  const studentResult = await pool.query(
    `SELECT id FROM users
     WHERE role = 'student' AND is_active = TRUE AND approval_status = 'approved'
     ORDER BY id LIMIT 1`,
  );
  studentId = studentResult.rows[0]?.id || await createUser("student", "student");
  pendingInstructorId = await createUser("instructor", "pending-instructor", "pending");
  tokens.admin = signToken(adminId);
  tokens.student = signToken(studentId);
  tokens.pendingInstructor = signToken(pendingInstructorId);
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
    if (enrollmentId) await pool.query("DELETE FROM enrollments WHERE id = $1", [enrollmentId]);
    if (courseId) await pool.query("DELETE FROM courses WHERE id = $1", [courseId]);
    if (announcementId) {
      await pool.query("DELETE FROM announcements WHERE id = $1", [announcementId]);
    }
    if (categoryName) {
      await pool.query("DELETE FROM course_categories WHERE name = $1", [categoryName]);
    }
    if (ids.length) await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [ids]);
  } finally {
    await pool.end();
  }
});

test("admin dashboard endpoints authorize, paginate, and use real PostgreSQL data", async (t) => {
  await t.test("dashboard reads reject non-administrator roles", async () => {
    assert.equal((await request("/admin/dashboard/overview", { role: "student" })).status, 403);
  });

  await t.test("overview and time-filtered analytics return database aggregates", async () => {
    const overview = await request("/admin/dashboard/overview");
    assert.equal(overview.status, 200);
    assert.ok(Number.isInteger(overview.body.summary.total_students));
    assert.ok(Number.isInteger(overview.body.summary.total_instructors));
    assert.ok(Number.isInteger(overview.body.summary.unique_enrolled_students));
    assert.equal(typeof overview.body.summary.course_completion_rate, "number");

    const analytics = await request("/admin/dashboard/analytics?months=6");
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.trends.length, 6);
    assert.equal(analytics.body.range_months, 6);
    assert.equal((await request("/admin/dashboard/analytics?months=7")).status, 400);
  });

  await t.test("people directory is paginated and omits credentials", async () => {
    const denied = await request("/admin/dashboard/people/student", { role: "student" });
    assert.equal(denied.status, 403);
    const response = await request("/admin/dashboard/people/student?page=1&limit=1");
    assert.equal(response.status, 200);
    assert.equal(response.body.users.length, 1);
    assert.equal("password_hash" in response.body.users[0], false);
    assert.equal(response.body.pagination.limit, 1);
  });

  await t.test("course and enrollment lists use server search and real counts", async () => {
    const courseResult = await pool.query(
      `INSERT INTO courses (instructor_id, title, slug, description, status)
       VALUES ($1, $2, $3, $4, 'published')
       RETURNING id`,
      [
        pendingInstructorId,
        `Dashboard course ${Date.now()}`,
        `dashboard-course-${Date.now()}-${Math.random()}`,
        "An integration test course description.",
      ],
    );
    courseId = courseResult.rows[0].id;
    const enrollmentResult = await pool.query(
      `INSERT INTO enrollments (student_id, course_id, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [studentId, courseId],
    );
    enrollmentId = enrollmentResult.rows[0].id;

    const denied = await request("/admin/dashboard/courses", { role: "student" });
    assert.equal(denied.status, 403);
    const courses = await request(`/admin/dashboard/courses?search=${encodeURIComponent("Dashboard course")}&status=published`);
    assert.equal(courses.status, 200);
    const listed = courses.body.courses.find((item) => String(item.id) === String(courseId));
    assert.ok(listed);
    assert.equal(listed.enrollment_count, 1);

    const enrollments = await request("/admin/dashboard/enrollments?search=Dashboard%20course&status=active");
    assert.equal(enrollments.status, 200);
    const record = enrollments.body.enrollments.find((item) => String(item.id) === String(enrollmentId));
    assert.ok(record);
    assert.equal(record.status, "active");
    assert.equal(Number(record.progress_percentage), 0);
  });

  await t.test("pending approvals are combined and remain server paginated", async () => {
    const response = await request("/admin/dashboard/approvals?page=1&limit=10");
    assert.equal(response.status, 200);
    assert.ok(response.body.users.some((user) => user.approval_status === "pending"));
    assert.ok(response.body.pagination.total >= 1);

    assert.equal((await request("/auth/me", { role: "pendingInstructor" })).status, 403);
    const decision = await request(`/users/instructors/${pendingInstructorId}/approval`, {
      method: "PATCH",
      body: { approval_status: "rejected", reason: "Profile details need clarification." },
    });
    assert.equal(decision.status, 200);
    assert.equal(decision.body.user.approval_reason, "Profile details need clarification.");
    assert.ok(decision.body.user.approval_reviewed_at);
    assert.equal(String(decision.body.user.approval_reviewed_by), String(adminId));
    assert.equal((await request("/auth/me", { role: "pendingInstructor" })).status, 403);
  });

  await t.test("category descriptions persist through admin CRUD", async () => {
    const initialName = `Console Test ${Date.now()}`;
    categoryName = initialName;
    const created = await request("/courses/categories", {
      method: "POST",
      body: { name: initialName, description: "Original description" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.category.description, "Original description");
    const listed = await request("/courses/categories");
    assert.equal(listed.status, 200);
    assert.ok(
      listed.body.categories.some(
        (category) => category.category === initialName && category.description === "Original description",
      ),
    );

    const renamedName = `${initialName} Updated`;
    const updated = await request(`/courses/categories/${encodeURIComponent(initialName)}`, {
      method: "PUT",
      body: { name: renamedName, description: "Updated description" },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.category.description, "Updated description");
    categoryName = renamedName;
    const invalid = await request(`/courses/categories/${encodeURIComponent(renamedName)}`, {
      method: "PUT",
      body: { name: renamedName, description: "x".repeat(2001) },
    });
    assert.equal(invalid.status, 400);
  });

  await t.test("publishing an announcement creates audience notifications exactly once", async () => {
    const draft = await request("/admin/announcements", {
      method: "POST",
      body: {
        title: `Dashboard test notice ${Date.now()}`,
        message: "This is a test-only in-app announcement.",
        audience: "all",
        status: "draft",
      },
    });
    assert.equal(draft.status, 201);
    announcementId = draft.body.announcement.id;
    assert.equal(draft.body.notifications_created, 0);

    const published = await request(`/admin/announcements/${announcementId}`, {
      method: "PATCH",
      body: { status: "published" },
    });
    assert.equal(published.status, 200);
    const delivered = await pool.query(
      "SELECT COUNT(*)::int AS total FROM notifications WHERE announcement_id = $1",
      [announcementId],
    );
    assert.equal(delivered.rows[0].total, published.body.notifications_created);

    const duplicate = await request(`/admin/announcements/${announcementId}`, {
      method: "PATCH",
      body: { status: "published" },
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.notifications_created, 0);
  });
});
