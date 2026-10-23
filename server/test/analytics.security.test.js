require("dotenv").config();

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const { pool } = require("../src/config/db");
const { getOverview } = require("../src/controllers/analyticsController");

let server;
let baseUrl;
let studentId;
let otherStudentId;
let instructorId;
let otherInstructorId;
let adminId;
let ownCourseId;
let otherCourseId;
let ownEnrollmentId;
let ownToken;
let instructorToken;
let adminToken;

function createToken(userId) {
  return jwt.sign(
    { sub: String(userId) },
    process.env.JWT_SECRET,
    {
      issuer: "learnsphere-lms",
      audience: "learnsphere-lms-client",
      algorithm: "HS256",
      expiresIn: "5m",
    }
  );
}

async function request(path, { token, method = "GET" } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function insertUser(suffix, role, label = role) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      `Analytics Security ${label}`,
      `${suffix}-${label}@example.invalid`,
      "test-only",
      role,
    ]
  );
  return result.rows[0].id;
}

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set a JWT_SECRET of at least 32 characters to run integration tests.");
  }

  const suffix = `analytics-security-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  instructorId = await insertUser(suffix, "instructor");
  otherInstructorId = await insertUser(suffix, "instructor", "other-instructor");
  studentId = await insertUser(suffix, "student");
  otherStudentId = await insertUser(suffix, "student", "other-student");
  adminId = await insertUser(suffix, "admin");

  const ownCourse = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, $2, $3, $4, 'published')
     RETURNING id`,
    [instructorId, "Analytics Own Course", `${suffix}-own`, "Test course."]
  );
  ownCourseId = ownCourse.rows[0].id;

  const otherCourse = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, $2, $3, $4, 'published')
     RETURNING id`,
    [otherInstructorId, "Analytics Other Course", `${suffix}-other`, "Test course."]
  );
  otherCourseId = otherCourse.rows[0].id;

  const ownModule = await pool.query(
    `INSERT INTO modules (course_id, title, position)
     VALUES ($1, 'Own Module', 1)
     RETURNING id`,
    [ownCourseId]
  );
  const ownLesson = await pool.query(
    `INSERT INTO lessons (module_id, title, position)
     VALUES ($1, 'Own Lesson', 1)
     RETURNING id`,
    [ownModule.rows[0].id]
  );
  const otherModule = await pool.query(
    `INSERT INTO modules (course_id, title, position)
     VALUES ($1, 'Other Module', 1)
     RETURNING id`,
    [otherCourseId]
  );
  const otherLesson = await pool.query(
    `INSERT INTO lessons (module_id, title, position)
     VALUES ($1, 'Other Lesson', 1)
     RETURNING id`,
    [otherModule.rows[0].id]
  );

  const ownEnrollment = await pool.query(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'completed')
     RETURNING id`,
    [studentId, ownCourseId]
  );
  ownEnrollmentId = ownEnrollment.rows[0].id;
  await pool.query(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'active')`,
    [otherStudentId, otherCourseId]
  );
  await pool.query(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id, completed)
     VALUES ($1, $2, TRUE)`,
    [ownEnrollmentId, ownLesson.rows[0].id]
  );
  const otherEnrollment = await pool.query(
    `SELECT id FROM enrollments
     WHERE student_id = $1 AND course_id = $2`,
    [otherStudentId, otherCourseId]
  );
  await pool.query(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id, completed)
     VALUES ($1, $2, TRUE)`,
    [otherEnrollment.rows[0].id, otherLesson.rows[0].id]
  );

  const ownAssignment = await pool.query(
    `INSERT INTO assignments (course_id, title, description, max_points, is_published)
     VALUES ($1, 'Own Assignment', 'Test assignment.', 10, TRUE)
     RETURNING id`,
    [ownCourseId]
  );
  const otherAssignment = await pool.query(
    `INSERT INTO assignments (course_id, title, description, max_points, is_published)
     VALUES ($1, 'Other Assignment', 'Test assignment.', 10, TRUE)
     RETURNING id`,
    [otherCourseId]
  );
  await pool.query(
    `INSERT INTO assignment_submissions (assignment_id, student_id, grade)
     VALUES ($1, $2, 8), ($3, $4, 5)`,
    [ownAssignment.rows[0].id, studentId, otherAssignment.rows[0].id, otherStudentId]
  );

  ownToken = createToken(studentId);
  instructorToken = createToken(instructorId);
  adminToken = createToken(adminId);

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  try {
    if (ownEnrollmentId) {
      await pool.query("DELETE FROM enrollments WHERE id = $1", [ownEnrollmentId]);
    }
    if (otherCourseId) {
      await pool.query(
        `DELETE FROM enrollments
         WHERE course_id = $1`,
        [otherCourseId]
      );
    }
    const courseIds = [ownCourseId, otherCourseId].filter(Boolean);
    if (courseIds.length) {
      await pool.query("DELETE FROM courses WHERE id = ANY($1::bigint[])", [courseIds]);
    }

    const userIds = [
      studentId,
      otherStudentId,
      instructorId,
      otherInstructorId,
      adminId,
    ].filter(Boolean);
    if (userIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
    }
  } finally {
    await pool.end();
  }
});

test("analytics endpoint enforces authentication and role-scoped data access", async (t) => {
  await t.test("rejects unauthenticated requests", async () => {
    const result = await request("/analytics/overview");
    assert.equal(result.status, 401);
  });

  await t.test("students see only their own enrollment, progress, and submissions", async () => {
    const result = await request("/analytics/overview", { token: ownToken });

    assert.equal(result.status, 200);
    assert.equal(result.body.analytics.role, "student");
    assert.deepEqual(
      result.body.analytics.courses.map((course) => String(course.course_id)),
      [String(ownCourseId)]
    );
    assert.equal(result.body.analytics.summary.enrolledCourses, 1);
    assert.equal(result.body.analytics.summary.lessonsCompleted, 1);
    assert.equal(result.body.analytics.summary.totalSubmissions, 1);
    assert.equal(result.body.analytics.summary.averageGrade, 8);
  });

  await t.test("instructors see only courses and assignment statistics they own", async () => {
    const result = await request("/analytics/overview", { token: instructorToken });

    assert.equal(result.status, 200);
    assert.equal(result.body.analytics.role, "instructor");
    assert.deepEqual(
      result.body.analytics.courses.map((course) => String(course.course_id)),
      [String(ownCourseId)]
    );
    assert.equal(result.body.analytics.summary.totalCourses, 1);
    assert.equal(result.body.analytics.summary.totalAssignments, 1);
    assert.equal(result.body.analytics.summary.totalSubmissions, 1);
    assert.equal(result.body.analytics.summary.averageGrade, 8);
  });

  await t.test("instructor student analytics is authenticated and owner-scoped", async () => {
    const unauthenticated = await request("/analytics/students");
    assert.equal(unauthenticated.status, 401);

    const result = await request("/analytics/students", {
      token: instructorToken,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.students.map((student) => String(student.course_id)),
      [String(ownCourseId)]
    );
    assert.equal(result.body.pagination.total, 1);
    assert.equal(
      result.body.students[0].student_name,
      "Analytics Security student"
    );

    const otherInstructorCourse = await request(
      `/analytics/students?courseId=${otherCourseId}`,
      { token: instructorToken }
    );
    assert.equal(otherInstructorCourse.status, 200);
    assert.equal(otherInstructorCourse.body.pagination.total, 0);

    const invalidPagination = await request(
      "/analytics/students?pageSize=51",
      { token: instructorToken }
    );
    assert.equal(invalidPagination.status, 400);

    const invalidSort = await request(
      "/analytics/students?sortBy=student_email%3BDROP",
      { token: instructorToken }
    );
    assert.equal(invalidSort.status, 400);

    const adminResult = await request("/analytics/students", {
      token: adminToken,
    });
    assert.equal(adminResult.status, 403);
  });

  await t.test("administrators receive platform-wide summary counts", async () => {
    const result = await request("/analytics/overview", { token: adminToken });

    assert.equal(result.status, 200);
    assert.equal(result.body.analytics.role, "admin");
    assert.ok(result.body.analytics.summary.total_users >= 5);
    assert.ok(result.body.analytics.summary.total_courses >= 2);
    assert.ok(result.body.analytics.summary.total_enrollments >= 2);
    assert.ok(result.body.analytics.summary.total_submissions >= 2);
  });

  await t.test("denies unexpected roles without querying analytics data", async () => {
    const response = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    let nextCalled = false;

    await getOverview(
      { user: { id: studentId, role: "unexpected" } },
      response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
    assert.equal(nextCalled, false);
  });
});
