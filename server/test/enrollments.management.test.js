require("dotenv").config();

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const { pool } = require("../src/config/db");

let server;
let baseUrl;
let instructorId;
let otherInstructorId;
let studentId;
let courseId;
let enrollmentId;
let instructorToken;
let otherInstructorToken;
let studentToken;

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    issuer: "learnsphere-lms",
    audience: "learnsphere-lms-client",
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function insertUser(suffix, role) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, 'test-only', $3)
     RETURNING id`,
    [
      `Enrollment Management ${role}`,
      `enrollment-management-${suffix}-${role}@example.invalid`,
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

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  instructorId = await insertUser(`${suffix}-owner`, "instructor");
  otherInstructorId = await insertUser(`${suffix}-other`, "instructor");
  studentId = await insertUser(`${suffix}-student`, "student");

  const course = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Enrollment Management Test Course', $2, 'Integration test course.', 'published')
     RETURNING id`,
    [instructorId, `enrollment-management-${suffix}`]
  );
  courseId = course.rows[0].id;

  const enrollment = await pool.query(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'active')
     RETURNING id`,
    [studentId, courseId]
  );
  enrollmentId = enrollment.rows[0].id;

  instructorToken = signToken(instructorId);
  otherInstructorToken = signToken(otherInstructorId);
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
    if (enrollmentId) {
      await pool.query("DELETE FROM enrollments WHERE id = $1", [enrollmentId]);
    }
    if (courseId) {
      await pool.query("DELETE FROM courses WHERE id = $1", [courseId]);
    }
    const userIds = [instructorId, otherInstructorId, studentId].filter(Boolean);
    if (userIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [
        userIds,
      ]);
    }
  } finally {
    await pool.end();
  }
});

test("instructors can manage enrollment status only in courses they own", async (t) => {
  await t.test("loads enrolled students for the owning instructor", async () => {
    const result = await request(`/enrollments/courses/${courseId}`, {
      token: instructorToken,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.length, 1);
    assert.equal(String(result.body.data[0].id), String(enrollmentId));
  });

  await t.test("cancels and reactivates an enrollment with a consistent response", async () => {
    const cancelled = await request(`/enrollments/${enrollmentId}/status`, {
      token: instructorToken,
      method: "PATCH",
      body: { status: "cancelled" },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, "cancelled");

    const activated = await request(`/enrollments/${enrollmentId}/status`, {
      token: instructorToken,
      method: "PATCH",
      body: { status: "active" },
    });
    assert.equal(activated.status, 200);
    assert.equal(activated.body.data.status, "active");
  });

  await t.test("rejects a different instructor and non-manager status changes", async () => {
    const otherInstructorList = await request(
      `/enrollments/courses/${courseId}`,
      { token: otherInstructorToken }
    );
    assert.equal(otherInstructorList.status, 403);

    const studentUpdate = await request(`/enrollments/${enrollmentId}/status`, {
      token: studentToken,
      method: "PATCH",
      body: { status: "cancelled" },
    });
    assert.equal(studentUpdate.status, 200);

    const otherInstructorUpdate = await request(
      `/enrollments/${enrollmentId}/status`,
      {
        token: otherInstructorToken,
        method: "PATCH",
        body: { status: "active" },
      }
    );
    assert.equal(otherInstructorUpdate.status, 403);
  });
});
