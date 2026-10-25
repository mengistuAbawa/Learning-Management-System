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
let ownCourseId;
let otherCourseId;
let liveClassId;
let enrollmentId;
let assignmentId;
let pendingSubmissionId;
let instructorToken;
let otherInstructorToken;
let studentToken;

function tokenFor(id) {
  return jwt.sign({ sub: String(id) }, process.env.JWT_SECRET, {
    issuer: "learnsphere-lms",
    audience: "learnsphere-lms-client",
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function request(path, token) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, body: await response.json() };
}

async function addUser(suffix, role) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, 'test-only', $3) RETURNING id`,
    [`Calendar ${role}`, `${suffix}-${role}@example.invalid`, role]
  );
  return result.rows[0].id;
}

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to at least 32 characters to run integration tests.");
  }
  const suffix = `calendar-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  instructorId = await addUser(`${suffix}-owner`, "instructor");
  otherInstructorId = await addUser(`${suffix}-other`, "instructor");
  studentId = await addUser(`${suffix}-student`, "student");

  const ownCourse = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Calendar owned course', $2, 'Calendar fixture.', 'published')
     RETURNING id`,
    [instructorId, `${suffix}-own`]
  );
  ownCourseId = ownCourse.rows[0].id;
  const otherCourse = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Other calendar course', $2, 'Calendar fixture.', 'published')
     RETURNING id`,
    [otherInstructorId, `${suffix}-other`]
  );
  otherCourseId = otherCourse.rows[0].id;

  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const liveClass = await pool.query(
    `INSERT INTO live_classes
       (course_id, instructor_id, title, scheduled_at, duration_minutes, time_zone)
     VALUES ($1, $2, 'Calendar live class', $3, 30, 'UTC')
     RETURNING id`,
    [ownCourseId, instructorId, future]
  );
  liveClassId = liveClass.rows[0].id;
  const assignment = await pool.query(
    `INSERT INTO assignments
       (course_id, title, description, due_at, max_points, is_published)
     VALUES ($1, 'Calendar assignment', 'Assignment fixture.', $2, 50, TRUE)
     RETURNING id`,
    [ownCourseId, new Date(future.getTime() + 60 * 60 * 1000)]
  );
  assignmentId = assignment.rows[0].id;
  const enrollment = await pool.query(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'active') RETURNING id`,
    [studentId, ownCourseId]
  );
  enrollmentId = enrollment.rows[0].id;
  const pending = await pool.query(
    `INSERT INTO assignment_submissions
       (assignment_id, student_id, submission_text, status)
     VALUES ($1, $2, 'Work awaiting review.', 'submitted')
     RETURNING id`,
    [assignmentId, studentId]
  );
  pendingSubmissionId = pending.rows[0].id;
  await pool.query(
    `INSERT INTO quizzes
       (course_id, title, description, time_limit_minutes, passing_score,
        max_attempts, is_published, opens_at)
     VALUES ($1, 'Calendar quiz', 'Quiz fixture.', 20, 60, 1, TRUE, $2)`,
    [ownCourseId, new Date(future.getTime() + 2 * 60 * 60 * 1000)]
  );

  instructorToken = tokenFor(instructorId);
  otherInstructorToken = tokenFor(otherInstructorId);
  studentToken = tokenFor(studentId);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (enrollmentId) {
    await pool.query("DELETE FROM enrollments WHERE id = $1", [enrollmentId]);
  }
  if (liveClassId) {
    await pool.query("DELETE FROM live_classes WHERE id = $1", [liveClassId]);
  }
  const courseIds = [ownCourseId, otherCourseId].filter(Boolean);
  if (courseIds.length) {
    await pool.query("DELETE FROM courses WHERE id = ANY($1::bigint[])", [courseIds]);
  }
  const userIds = [instructorId, otherInstructorId, studentId].filter(Boolean);
  if (userIds.length) {
    await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
  }
  await pool.end();
});

test("instructor calendar returns only owned course events", async () => {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const range = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  assert.equal((await request(`/analytics/calendar${range}`)).status, 401);
  assert.equal((await request(`/analytics/calendar${range}`, studentToken)).status, 403);

  const own = await request(`/analytics/calendar${range}`, instructorToken);
  assert.equal(own.status, 200);
  assert.ok(own.body.events.some((event) => String(event.event_id) === String(liveClassId)));
  assert.ok(own.body.events.some((event) => event.event_type === "assignment_due"));
  assert.ok(own.body.events.some((event) => event.event_type === "quiz_opening"));
  assert.ok(own.body.events.every((event) => String(event.course_id) === String(ownCourseId)));

  const other = await request(`/analytics/calendar${range}`, otherInstructorToken);
  assert.equal(other.status, 200);
  assert.deepEqual(other.body.events, []);
  assert.equal(
    (await request("/analytics/calendar?from=invalid&to=invalid", instructorToken)).status,
    400
  );

  const pending = await request("/assignments/submissions/pending?limit=20", instructorToken);
  assert.equal(pending.status, 200);
  assert.ok(pending.body.submissions.some(
    (submission) => String(submission.id) === String(pendingSubmissionId)
  ));
  assert.equal(pending.body.submissions.find(
    (submission) => String(submission.id) === String(pendingSubmissionId)
  ).course_id.toString(), ownCourseId.toString());
  const otherPending = await request(
    "/assignments/submissions/pending?limit=20",
    otherInstructorToken
  );
  assert.equal(otherPending.status, 200);
  assert.ok(!otherPending.body.submissions.some(
    (submission) => String(submission.id) === String(pendingSubmissionId)
  ));
  assert.equal(
    (await request("/assignments/submissions/pending", studentToken)).status,
    403
  );
});
