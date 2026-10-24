require("dotenv").config();

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const { RoomServiceClient } = require("livekit-server-sdk");
const app = require("../src/server");
const { pool } = require("../src/config/db");

let server;
let baseUrl;
let instructorId;
let otherInstructorId;
let studentId;
let unenrolledStudentId;
let courseId;
let otherCourseId;
let enrollmentId;
let liveClassId;
let instructorToken;
let studentToken;
let otherInstructorToken;
let unenrolledStudentToken;

const previousLiveKitEnv = {
  url: process.env.LIVEKIT_URL,
  key: process.env.LIVEKIT_API_KEY,
  secret: process.env.LIVEKIT_API_SECRET,
};

function signedToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    issuer: "learnsphere-lms",
    audience: "learnsphere-lms-client",
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function request(path, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function insertUser(suffix, role) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, 'test-only', $3)
     RETURNING id`,
    [`Live Class ${role}`, `live-class-${suffix}-${role}@example.invalid`, role]
  );
  return result.rows[0].id;
}

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to at least 32 characters to run integration tests.");
  }

  process.env.LIVEKIT_URL = "wss://test-project.livekit.cloud";
  process.env.LIVEKIT_API_KEY = "test-api-key";
  process.env.LIVEKIT_API_SECRET = "test-api-secret-that-is-long-enough-for-jwt-signing";

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  instructorId = await insertUser(`${suffix}-owner`, "instructor");
  otherInstructorId = await insertUser(`${suffix}-other`, "instructor");
  studentId = await insertUser(`${suffix}-student`, "student");
  unenrolledStudentId = await insertUser(`${suffix}-unenrolled`, "student");

  const course = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Live Class Test Course', $2, 'Integration test course.', 'published')
     RETURNING id`,
    [instructorId, `live-class-${suffix}`]
  );
  courseId = course.rows[0].id;

  const otherCourse = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Other Live Class Test Course', $2, 'Integration test course.', 'published')
     RETURNING id`,
    [otherInstructorId, `live-class-other-${suffix}`]
  );
  otherCourseId = otherCourse.rows[0].id;

  const enrollment = await pool.query(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'active')
     RETURNING id`,
    [studentId, courseId]
  );
  enrollmentId = enrollment.rows[0].id;

  instructorToken = signedToken(instructorId);
  studentToken = signedToken(studentId);
  otherInstructorToken = signedToken(otherInstructorId);
  unenrolledStudentToken = signedToken(unenrolledStudentId);

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
    if (liveClassId) {
      await pool.query("DELETE FROM live_classes WHERE id = $1", [liveClassId]);
    }
    if (enrollmentId) {
      await pool.query("DELETE FROM enrollments WHERE id = $1", [enrollmentId]);
    }
    const courseIds = [courseId, otherCourseId].filter(Boolean);
    if (courseIds.length) {
      await pool.query("DELETE FROM courses WHERE id = ANY($1::bigint[])", [
        courseIds,
      ]);
    }
    const userIds = [
      instructorId,
      otherInstructorId,
      studentId,
      unenrolledStudentId,
    ].filter(Boolean);
    if (userIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [
        userIds,
      ]);
    }
  } finally {
    if (previousLiveKitEnv.url === undefined) delete process.env.LIVEKIT_URL;
    else process.env.LIVEKIT_URL = previousLiveKitEnv.url;
    if (previousLiveKitEnv.key === undefined) delete process.env.LIVEKIT_API_KEY;
    else process.env.LIVEKIT_API_KEY = previousLiveKitEnv.key;
    if (previousLiveKitEnv.secret === undefined) {
      delete process.env.LIVEKIT_API_SECRET;
    } else {
      process.env.LIVEKIT_API_SECRET = previousLiveKitEnv.secret;
    }
    await pool.end();
  }
});

test("live classes enforce course permissions and issue scoped provider tokens", async (t) => {
  await t.test("requires authentication to list classes", async () => {
    const result = await request("/live-classes");
    assert.equal(result.status, 401);
  });

  const classPayload = {
    course_id: Number(courseId),
    title: "Secure Live Class",
    description: "A test session.",
    learning_objectives: "Verify protected scheduling and room access.",
    scheduled_at: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
    duration_minutes: 30,
    time_zone: "UTC",
  };

  await t.test("only the course instructor may schedule a class", async () => {
    const forbidden = await request("/live-classes", {
      token: otherInstructorToken,
      method: "POST",
      body: classPayload,
    });
    assert.equal(forbidden.status, 403);

    const created = await request("/live-classes", {
      token: instructorToken,
      method: "POST",
      body: classPayload,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.live_class.title, classPayload.title);
    liveClassId = created.body.live_class.id;
  });

  await t.test("students see only classes for their active enrollments", async () => {
    const enrolled = await request("/live-classes", { token: studentToken });
    assert.equal(enrolled.status, 200);
    assert.equal(enrolled.body.classes.length, 1);

    const absent = await request("/live-classes", {
      token: unenrolledStudentToken,
    });
    assert.equal(absent.status, 200);
    assert.equal(absent.body.classes.length, 0);

    const denied = await request(`/live-classes/${liveClassId}`, {
      token: unenrolledStudentToken,
    });
    assert.equal(denied.status, 403);
  });

  await t.test("students cannot start a class or obtain a token for a scheduled class", async () => {
    const start = await request(`/live-classes/${liveClassId}/start`, {
      token: studentToken,
      method: "POST",
    });
    assert.equal(start.status, 403);

    const token = await request(`/live-classes/${liveClassId}/token`, {
      token: studentToken,
      method: "POST",
    });
    assert.equal(token.status, 409);
  });

  await t.test("authorized instructor starts class and receives a moderator token", async () => {
    const started = await request(`/live-classes/${liveClassId}/start`, {
      token: instructorToken,
      method: "POST",
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.live_class.status, "live");

    const result = await request(`/live-classes/${liveClassId}/token`, {
      token: instructorToken,
      method: "POST",
    });
    assert.equal(result.status, 200);
    const grant = jwt.decode(result.body.token).video;
    assert.equal(grant.roomAdmin, true);
    assert.equal(grant.canPublishData, false);
    assert.ok(grant.canPublishSources.includes("screen_share"));
  });

  await t.test("enrolled student gets media access without instructor privileges", async () => {
    const result = await request(`/live-classes/${liveClassId}/token`, {
      token: studentToken,
      method: "POST",
    });
    assert.equal(result.status, 200);
    const grant = jwt.decode(result.body.token).video;
    assert.notEqual(grant.roomAdmin, true);
    assert.equal(grant.canPublishData, false);
    assert.ok(grant.canPublishSources.includes("microphone"));
    assert.ok(!grant.canPublishSources.includes("screen_share"));
  });

  await t.test("chat and hand-raise actions require class access and validate messages", async () => {
    const forbiddenMessage = await request(`/live-classes/${liveClassId}/chat`, {
      token: unenrolledStudentToken,
      method: "POST",
      body: { message: "Not enrolled" },
    });
    assert.equal(forbiddenMessage.status, 403);

    const forbiddenHand = await request(`/live-classes/${liveClassId}/hand`, {
      token: otherInstructorToken,
      method: "POST",
      body: { raised: true },
    });
    assert.equal(forbiddenHand.status, 403);

    const emptyMessage = await request(`/live-classes/${liveClassId}/chat`, {
      token: studentToken,
      method: "POST",
      body: { message: " " },
    });
    assert.equal(emptyMessage.status, 400);

    const oversizedMessage = await request(`/live-classes/${liveClassId}/chat`, {
      token: studentToken,
      method: "POST",
      body: { message: "x".repeat(501) },
    });
    assert.equal(oversizedMessage.status, 400);
  });

  await t.test("ending a class deletes its LiveKit room and rejects unauthorized users", async () => {
    const originalListRooms = RoomServiceClient.prototype.listRooms;
    const originalDeleteRoom = RoomServiceClient.prototype.deleteRoom;
    let deletedRoomName;
    RoomServiceClient.prototype.listRooms = async (roomNames) =>
      roomNames.map((name) => ({ name }));
    RoomServiceClient.prototype.deleteRoom = async (roomName) => {
      deletedRoomName = roomName;
    };

    try {
      const studentResult = await request(`/live-classes/${liveClassId}/end`, {
        token: studentToken,
        method: "POST",
      });
      assert.equal(studentResult.status, 403);

      const otherInstructorResult = await request(
        `/live-classes/${liveClassId}/end`,
        { token: otherInstructorToken, method: "POST" }
      );
      assert.equal(otherInstructorResult.status, 403);

      const ended = await request(`/live-classes/${liveClassId}/end`, {
        token: instructorToken,
        method: "POST",
      });
      assert.equal(ended.status, 200);
      assert.equal(ended.body.live_class.status, "ended");
      assert.match(deletedRoomName, /^learnsphere-/);
    } finally {
      RoomServiceClient.prototype.listRooms = originalListRooms;
      RoomServiceClient.prototype.deleteRoom = originalDeleteRoom;
    }
  });

  await t.test("unenrolled students and unrelated instructors cannot access room tokens", async () => {
    for (const token of [unenrolledStudentToken, otherInstructorToken]) {
      const result = await request(`/live-classes/${liveClassId}/token`, {
        token,
        method: "POST",
      });
      assert.equal(result.status, 403);
    }
  });
});
