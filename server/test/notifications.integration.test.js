require("dotenv").config();

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const { pool } = require("../src/config/db");
const { notifyAssignmentGraded } = require("../src/services/notificationService");

let server;
let baseUrl;
let instructorId;
let studentId;
let courseId;
let submissionId;
let instructorToken;
let studentToken;

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

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set a JWT_SECRET of at least 32 characters to run integration tests.");
  }

  const suffix = `notification-test-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  const instructor = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'instructor')
     RETURNING id`,
    ["Notification Test Instructor", `${suffix}-instructor@example.invalid`, "test-only"]
  );
  instructorId = instructor.rows[0].id;

  const student = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'student')
     RETURNING id`,
    ["Notification Test Student", `${suffix}-student@example.invalid`, "test-only"]
  );
  studentId = student.rows[0].id;

  const course = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, $2, $3, $4, 'published')
     RETURNING id`,
    [
      instructorId,
      "Notification Test Course",
      `${suffix}-course`,
      "Temporary course for notification integration tests.",
    ]
  );
  courseId = course.rows[0].id;

  const assignment = await pool.query(
    `INSERT INTO assignments (course_id, title, description, max_points)
     VALUES ($1, $2, $3, 10)
     RETURNING id`,
    [courseId, "Notification Test Assignment", "Temporary assignment."]
  );

  const submission = await pool.query(
    `INSERT INTO assignment_submissions
       (assignment_id, student_id, submission_text, status)
     VALUES ($1, $2, $3, 'submitted')
     RETURNING id`,
    [assignment.rows[0].id, studentId, "Temporary submission."]
  );
  submissionId = submission.rows[0].id;

  instructorToken = createToken(instructorId);
  studentToken = createToken(studentId);

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
    if (courseId) {
      await pool.query("DELETE FROM courses WHERE id = $1", [courseId]);
    }

    const userIds = [instructorId, studentId].filter(Boolean);
    if (userIds.length) {
      await pool.query(
        "DELETE FROM users WHERE id = ANY($1::bigint[])",
        [userIds]
      );
    }
  } finally {
    await pool.end();
  }
});

test("notification API enforces ownership and assignment grading alerts", async (t) => {
  await t.test("requires authentication and validates inputs", async () => {
    const unauthenticated = await request("/notifications");
    assert.equal(unauthenticated.status, 401);

    const invalidLimit = await request("/notifications?limit=101", {
      token: studentToken,
    });
    assert.equal(invalidLimit.status, 400);

    const invalidId = await request("/notifications/invalid/read", {
      token: studentToken,
      method: "PATCH",
    });
    assert.equal(invalidId.status, 400);
  });

  await t.test("returns an empty list and zero unread count", async () => {
    const result = await request("/notifications", { token: studentToken });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.notifications, []);
    assert.equal(result.body.unread_count, 0);
    assert.equal(result.body.pagination.has_more, false);
  });

  const ownNotifications = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message)
     SELECT $1, 'general', 'Test notification ' || n, 'Test notification message'
     FROM generate_series(1, 3) n
     RETURNING id`,
    [studentId]
  );
  const foreignNotification = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message)
     VALUES ($1, 'general', 'Private notification', 'Private message')
     RETURNING id`,
    [instructorId]
  );

  await t.test("paginates only the authenticated user's notifications", async () => {
    const firstPage = await request("/notifications?limit=2&offset=0", {
      token: studentToken,
    });
    const secondPage = await request("/notifications?limit=2&offset=2", {
      token: studentToken,
    });

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.notifications.length, 2);
    assert.equal(firstPage.body.unread_count, 3);
    assert.equal(firstPage.body.pagination.has_more, true);
    assert.equal(secondPage.body.notifications.length, 1);
    assert.equal(
      firstPage.body.notifications.some(
        (item) => String(item.id) === String(secondPage.body.notifications[0].id)
      ),
      false
    );
  });

  await t.test("prevents reading or deleting another user's notification", async () => {
    const read = await request(
      `/notifications/${foreignNotification.rows[0].id}/read`,
      { token: studentToken, method: "PATCH" }
    );
    const deleted = await request(
      `/notifications/${foreignNotification.rows[0].id}`,
      { token: studentToken, method: "DELETE" }
    );

    assert.equal(read.status, 404);
    assert.equal(deleted.status, 404);

    const stored = await pool.query(
      "SELECT is_read FROM notifications WHERE id = $1",
      [foreignNotification.rows[0].id]
    );
    assert.equal(stored.rows[0].is_read, false);

    const instructorList = await request("/notifications", {
      token: instructorToken,
    });
    assert.equal(instructorList.body.notifications.length, 1);
    assert.equal(
      String(instructorList.body.notifications[0].id),
      String(foreignNotification.rows[0].id)
    );
  });

  await t.test("marks one and all as read, counts unread, and deletes owned alerts", async () => {
    const marked = await request(
      `/notifications/${ownNotifications.rows[0].id}/read`,
      { token: studentToken, method: "PATCH" }
    );
    assert.equal(marked.status, 200);
    assert.ok(marked.body.notification.read_at);

    const count = await request("/notifications/unread-count", {
      token: studentToken,
    });
    assert.equal(count.body.unread_count, 2);

    const markedAll = await request("/notifications/read-all", {
      token: studentToken,
      method: "PATCH",
    });
    assert.equal(markedAll.body.updated_count, 2);

    const clearedCount = await request("/notifications/unread-count", {
      token: studentToken,
    });
    assert.equal(clearedCount.body.unread_count, 0);

    const deleted = await request(
      `/notifications/${ownNotifications.rows[1].id}`,
      { token: studentToken, method: "DELETE" }
    );
    assert.equal(deleted.status, 200);
  });

  await t.test("creates one student-owned notification only after grading succeeds", async () => {
    const path = `/assignment-submissions/${submissionId}/grade`;
    const invalidGrade = await request(path, {
      token: instructorToken,
      method: "PATCH",
      body: { grade: 11, feedback: "Invalid grade" },
    });
    assert.equal(invalidGrade.status, 400);

    let gradeNotifications = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = 'assignment_graded'`,
      [studentId]
    );
    assert.equal(gradeNotifications.rowCount, 0);

    const validGrade = await request(path, {
      token: instructorToken,
      method: "PATCH",
      body: { grade: 8, feedback: "Good work." },
    });
    assert.equal(validGrade.status, 200);

    const retry = await request(path, {
      token: instructorToken,
      method: "PATCH",
      body: { grade: 8, feedback: "Good work." },
    });
    assert.equal(retry.status, 200);

    gradeNotifications = await pool.query(
      `SELECT user_id, link_url FROM notifications
       WHERE user_id = $1 AND type = 'assignment_graded'`,
      [studentId]
    );
    assert.equal(gradeNotifications.rowCount, 1);
    assert.equal(
      gradeNotifications.rows[0].link_url,
      `/courses/${courseId}/assignments`
    );

    await Promise.all(
      Array.from({ length: 3 }, () =>
        notifyAssignmentGraded({
          userId: studentId,
          assignmentTitle: "Notification Test Assignment",
          courseId,
          submissionId,
          grade: 8,
          feedback: "Good work.",
        })
      )
    );
    gradeNotifications = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = 'assignment_graded'`,
      [studentId]
    );
    assert.equal(gradeNotifications.rowCount, 1);

    const leaked = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = 'assignment_graded'`,
      [instructorId]
    );
    assert.equal(leaked.rowCount, 0);
  });

  await t.test("notification insertion failure does not fail a saved grade", async () => {
    const originalQuery = pool.query.bind(pool);
    const originalConsoleError = console.error;
    pool.query = (query, values) => {
      if (
        typeof query === "string" &&
        query.includes("INSERT INTO notifications")
      ) {
        return Promise.reject(new Error("simulated notification database failure"));
      }
      return originalQuery(query, values);
    };
    console.error = () => {};

    let result;
    try {
      result = await request(
        `/assignment-submissions/${submissionId}/grade`,
        {
          token: instructorToken,
          method: "PATCH",
          body: { grade: 9, feedback: "Updated feedback." },
        }
      );
    } finally {
      pool.query = originalQuery;
      console.error = originalConsoleError;
    }

    assert.equal(result.status, 200);
    const grade = await pool.query(
      "SELECT grade FROM assignment_submissions WHERE id = $1",
      [submissionId]
    );
    assert.equal(Number(grade.rows[0].grade), 9);
  });
});
