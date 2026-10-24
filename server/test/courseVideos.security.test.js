require("dotenv").config();

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const { pool } = require("../src/config/db");

let server;
let baseUrl;
let instructorId;
let otherInstructorId;
let studentId;
let unenrolledStudentId;
let adminId;
let courseId;
let otherCourseId;
let enrollmentId;
let videoId;
let draftVideoId;
const createdVideoIds = [];

function signedToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    issuer: "learnsphere-lms",
    audience: "learnsphere-lms-client",
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function request(route, { token, method = "GET", body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) {
    requestHeaders["Content-Type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: requestHeaders,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    headers: response.headers,
    body: contentType.includes("application/json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer()),
  };
}

async function insertUser(label, role) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, 'test-only', $3)
     RETURNING id`,
    [
      `Course Video ${label}`,
      `course-video-${Date.now()}-${Math.random()}-${label}@example.invalid`,
      role,
    ]
  );
  return result.rows[0].id;
}

function validWebmForm(
  title = "Test lesson",
  status = "published",
  mediaType = "video/webm"
) {
  const form = new FormData();
  form.append("title", title);
  form.append("status", status);
  form.append(
    "video",
    new Blob([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x01, 0x02])], {
      type: mediaType,
    }),
    "lesson.webm"
  );
  return form;
}

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to at least 32 characters to run integration tests.");
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  instructorId = await insertUser(`${suffix}-owner`, "instructor");
  otherInstructorId = await insertUser(`${suffix}-other`, "instructor");
  studentId = await insertUser(`${suffix}-student`, "student");
  unenrolledStudentId = await insertUser(`${suffix}-unenrolled`, "student");
  adminId = await insertUser(`${suffix}-admin`, "admin");

  const course = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Video Test Course', $2, 'Video authorization test.', 'published')
     RETURNING id`,
    [instructorId, `course-video-${suffix}`]
  );
  courseId = course.rows[0].id;
  const otherCourse = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Other Video Test Course', $2, 'Video authorization test.', 'published')
     RETURNING id`,
    [otherInstructorId, `course-video-other-${suffix}`]
  );
  otherCourseId = otherCourse.rows[0].id;

  const enrollment = await pool.query(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'active')
     RETURNING id`,
    [studentId, courseId]
  );
  enrollmentId = enrollment.rows[0].id;

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
    for (const id of createdVideoIds) {
      const result = await pool.query(
        "SELECT storage_key, media_type FROM course_videos WHERE id = $1",
        [id]
      );
      if (result.rows[0]) {
        const extension = {
          "video/webm": ".webm",
          "video/mp4": ".mp4",
          "video/ogg": ".ogv",
        }[result.rows[0].media_type];
        await fs.rm(
          path.join(
            __dirname,
            "..",
            "storage",
            "course-videos",
            `${result.rows[0].storage_key}${extension}`
          ),
          { force: true }
        );
      }
    }
    if (createdVideoIds.length) {
      await pool.query("DELETE FROM course_videos WHERE id = ANY($1::bigint[])", [
        createdVideoIds,
      ]);
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
      adminId,
    ].filter(Boolean);
    if (userIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [
        userIds,
      ]);
    }
  } finally {
    await pool.end();
  }
});

test("course video recording and playback enforce ownership and enrollment", async (t) => {
  await t.test("requires authentication and instructor role to upload", async () => {
    assert.equal(
      (await request(`/course-videos/courses/${courseId}`, {
        method: "POST",
        body: validWebmForm(),
      })).status,
      401
    );
    assert.equal(
      (await request(`/course-videos/courses/${courseId}`, {
        token: signedToken(studentId),
        method: "POST",
        body: validWebmForm(),
      })).status,
      403
    );
  });

  await t.test("instructors can upload only to their own course", async () => {
    const forbidden = await request(`/course-videos/courses/${otherCourseId}`, {
      token: signedToken(instructorId),
      method: "POST",
      body: validWebmForm(),
    });
    assert.equal(forbidden.status, 403);

    const created = await request(`/course-videos/courses/${courseId}`, {
      token: signedToken(instructorId),
      method: "POST",
      body: validWebmForm(),
    });
    assert.equal(created.status, 201);
    videoId = created.body.video.id;
    createdVideoIds.push(videoId);
  });

  await t.test("instructors can save a private draft and publish it later", async () => {
    const saved = await request(`/course-videos/courses/${courseId}`, {
      token: signedToken(instructorId),
      method: "POST",
      body: validWebmForm("Draft lesson", "draft"),
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.video.status, "draft");
    draftVideoId = saved.body.video.id;
    createdVideoIds.push(draftVideoId);

    const studentList = await request("/course-videos", {
      token: signedToken(studentId),
    });
    assert.ok(
      !studentList.body.videos.some(
        (video) => String(video.id) === String(draftVideoId)
      )
    );
    assert.equal(
      (await request(`/course-videos/${draftVideoId}/playback`, {
        token: signedToken(studentId),
        method: "POST",
      })).status,
      404
    );
    assert.equal(
      (await request(`/course-videos/${draftVideoId}/publish`, {
        token: signedToken(otherInstructorId),
        method: "PATCH",
      })).status,
      404
    );
    assert.equal(
      (await request(`/course-videos/${draftVideoId}/publish`, {
        token: signedToken(studentId),
        method: "PATCH",
      })).status,
      403
    );

    const published = await request(`/course-videos/${draftVideoId}/publish`, {
      token: signedToken(instructorId),
      method: "PATCH",
    });
    assert.equal(published.status, 200);
    assert.equal(published.body.video.status, "published");
    const publishedList = await request("/course-videos", {
      token: signedToken(studentId),
    });
    assert.ok(
      publishedList.body.videos.some(
        (video) => String(video.id) === String(draftVideoId)
      )
    );
  });

  await t.test("identifies WebM recordings even when the browser reports a generic MIME type", async () => {
    const uploaded = await request(`/course-videos/courses/${courseId}`, {
      token: signedToken(instructorId),
      method: "POST",
      body: validWebmForm(
        "Browser-recognized lesson",
        "published",
        "application/octet-stream"
      ),
    });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.video.media_type, "video/webm");
    createdVideoIds.push(uploaded.body.video.id);
  });

  await t.test("students see only videos for active or completed enrollments", async () => {
    const enrolled = await request("/course-videos", { token: signedToken(studentId) });
    assert.equal(enrolled.status, 200);
    assert.ok(enrolled.body.videos.some((video) => String(video.id) === String(videoId)));

    const unenrolled = await request("/course-videos", {
      token: signedToken(unenrolledStudentId),
    });
    assert.equal(unenrolled.status, 200);
    assert.ok(
      !unenrolled.body.videos.some((video) => String(video.id) === String(videoId))
    );
  });

  await t.test("playback link and byte-range streaming recheck access", async () => {
    const wrongInstructor = await request(`/course-videos/${videoId}/playback`, {
      token: signedToken(otherInstructorId),
      method: "POST",
    });
    assert.equal(wrongInstructor.status, 404);

    const denied = await request(`/course-videos/${videoId}/playback`, {
      token: signedToken(unenrolledStudentId),
      method: "POST",
    });
    assert.equal(denied.status, 404);

    const allowed = await request(`/course-videos/${videoId}/playback`, {
      token: signedToken(studentId),
      method: "POST",
    });
    assert.equal(allowed.status, 200);
    const streamPath = `/api/${allowed.body.path}`;
    const streamUrl = new URL(`${baseUrl}${streamPath}`);
    const playbackClaims = jwt.verify(
      streamUrl.searchParams.get("token"),
      process.env.JWT_SECRET,
      {
        issuer: "learnsphere-course-video",
        audience: "learnsphere-course-video-stream",
        algorithms: ["HS256"],
      }
    );
    assert.equal(playbackClaims.video_id, String(videoId));
    assert.equal(playbackClaims.sub, String(studentId));

    const administrator = await request(`/course-videos/${videoId}/playback`, {
      token: signedToken(adminId),
      method: "POST",
    });
    assert.equal(administrator.status, 200);

    const range = await fetch(streamUrl, {
      headers: {
        Range: "bytes=0-3",
        Origin: "http://localhost:5173",
      },
    });
    assert.equal(range.status, 206);
    assert.equal(
      range.headers.get("access-control-allow-origin"),
      "http://localhost:5173"
    );
    assert.equal(range.headers.get("content-range"), "bytes 0-3/7");
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));

    await pool.query(
      "UPDATE enrollments SET status = 'completed' WHERE id = $1",
      [enrollmentId]
    );
    assert.equal(
      (await request(`/course-videos/${videoId}/playback`, {
        token: signedToken(studentId),
        method: "POST",
      })).status,
      200
    );

    assert.equal(
      (await fetch(`${baseUrl}${streamPath}`, { headers: { Range: "bytes=99-100" } })).status,
      416
    );
    await pool.query(
      "UPDATE enrollments SET status = 'cancelled' WHERE id = $1",
      [enrollmentId]
    );
    assert.equal((await fetch(`${baseUrl}${streamPath}`)).status, 404);
  });

  await t.test("rejects malformed media and refuses streams without a scoped token", async () => {
    const form = new FormData();
    form.append("title", "Not a video");
    form.append("video", new Blob(["not video"], { type: "video/webm" }), "bad.webm");
    const invalid = await request(`/course-videos/courses/${courseId}`, {
      token: signedToken(instructorId),
      method: "POST",
      body: form,
    });
    assert.equal(invalid.status, 415);
    assert.equal(
      (await fetch(`${baseUrl}/api/course-videos/${videoId}/stream`)).status,
      401
    );
  });
});
