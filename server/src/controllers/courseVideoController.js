const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const videoDirectory = path.resolve(__dirname, "..", "..", "storage", "course-videos");
const videoExtensions = {
  "video/webm": ".webm",
  "video/mp4": ".mp4",
  "video/ogg": ".ogv",
};

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or too short.");
  }
  return secret;
}

async function getVideoAccess(userId, videoId) {
  const result = await pool.query(
    `SELECT cv.id, cv.course_id, cv.lesson_id, cv.instructor_id, cv.title,
            cv.storage_key, cv.media_type, cv.file_size, cv.created_at,
            c.title AS course_title, u.full_name AS instructor_name
     FROM course_videos cv
     JOIN courses c ON c.id = cv.course_id
     JOIN users actor ON actor.id = $1 AND actor.is_active = TRUE
     JOIN users u ON u.id = cv.instructor_id
     WHERE cv.id = $2
       AND (
         actor.role = 'admin'
         OR (actor.role = 'instructor' AND cv.instructor_id = actor.id)
         OR (
           actor.role = 'student'
           AND cv.status = 'published'
           AND EXISTS (
             SELECT 1 FROM enrollments e
             WHERE e.student_id = actor.id
               AND e.course_id = cv.course_id
               AND e.status IN ('active', 'completed')
           )
         )
       )
     LIMIT 1`,
    [userId, videoId]
  );
  return result.rows[0] || null;
}

async function list(req, res, next) {
  try {
    let filter;
    if (req.user.role === "admin") {
      filter = "";
    } else if (req.user.role === "instructor") {
      filter = "WHERE cv.instructor_id = $1";
    } else if (req.user.role === "student") {
      filter = `WHERE EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.student_id = $1
          AND e.course_id = cv.course_id
          AND e.status IN ('active', 'completed')
      ) AND cv.status = 'published'`;
    } else {
      return sendError(res, 403, "Your role cannot view course videos.");
    }

    const result = await pool.query(
      `SELECT cv.id, cv.course_id, cv.lesson_id, cv.title, cv.description, cv.position,
              cv.media_type, cv.status,
              cv.file_size, cv.created_at, c.title AS course_title,
              COALESCE(cvp.last_position_seconds, 0)::int AS last_position_seconds,
              cvp.duration_seconds,
              COALESCE(cvp.completed, FALSE) AS completed,
              cvp.completed_at,
              u.full_name AS instructor_name
       FROM course_videos cv
       JOIN courses c ON c.id = cv.course_id
       JOIN users u ON u.id = cv.instructor_id
       LEFT JOIN course_video_progress cvp
         ON cvp.video_id = cv.id AND cvp.user_id = $1
       ${filter}
       ORDER BY cv.course_id, cv.position, cv.created_at
       LIMIT 100`,
      [req.user.id]
    );
    return res.json({ success: true, videos: result.rows });
  } catch (error) {
    next(error);
  }
}

async function getProgress(req, res, next) {
  if (req.user.role !== "student") {
    return sendError(res, 403, "Video progress is available to enrolled students.");
  }

  try {
    const video = await getVideoAccess(req.user.id, req.params.id);
    if (!video) return sendError(res, 404, "Video not found or access is not allowed.");

    const result = await pool.query(
      `SELECT last_position_seconds, duration_seconds, completed,
              completed_at, updated_at
       FROM course_video_progress
       WHERE video_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    return res.json({
      success: true,
      progress: result.rows[0] || {
        last_position_seconds: 0,
        duration_seconds: null,
        completed: false,
        completed_at: null,
        updated_at: null,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function saveProgress(req, res, next) {
  if (req.user.role !== "student") {
    return sendError(res, 403, "Only students can save video progress.");
  }

  const position = Number(req.body.position_seconds);
  const duration =
    req.body.duration_seconds === null || req.body.duration_seconds === undefined
      ? null
      : Number(req.body.duration_seconds);
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position > 86400 ||
    (duration !== null &&
      (!Number.isInteger(duration) ||
        duration < 1 ||
        duration > 86400 ||
        position > duration + 5))
  ) {
    return sendError(res, 400, "Video position or duration is invalid.");
  }

  try {
    const video = await getVideoAccess(req.user.id, req.params.id);
    if (!video) return sendError(res, 404, "Video not found or access is not allowed.");

    // Completion is based on actual player time reaching 90% of known duration.
    // Opening a video or seeking to its end does not complete it through the UI.
    const completed = duration !== null && position / duration >= 0.9;
    const result = await pool.query(
      `INSERT INTO course_video_progress
         (video_id, user_id, last_position_seconds, duration_seconds,
          completed, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5,
               CASE WHEN $5 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (video_id, user_id)
       DO UPDATE SET
         last_position_seconds = EXCLUDED.last_position_seconds,
         duration_seconds = COALESCE(EXCLUDED.duration_seconds,
                                     course_video_progress.duration_seconds),
         completed = course_video_progress.completed OR EXCLUDED.completed,
         completed_at = CASE
           WHEN course_video_progress.completed OR EXCLUDED.completed
             THEN COALESCE(course_video_progress.completed_at, NOW())
           ELSE NULL
         END,
         updated_at = NOW()
       RETURNING last_position_seconds, duration_seconds, completed,
                 completed_at, updated_at`,
      [req.params.id, req.user.id, position, duration, completed]
    );
    return res.json({ success: true, progress: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function getCourseAnalytics(req, res, next) {
  if (!["instructor", "admin"].includes(req.user.role)) {
    return sendError(res, 403, "Only instructors can view video analytics.");
  }

  try {
    const course = await pool.query(
      "SELECT id, instructor_id FROM courses WHERE id = $1",
      [req.params.courseId]
    );
    if (!course.rowCount) return sendError(res, 404, "Course not found.");
    if (
      req.user.role !== "admin" &&
      String(course.rows[0].instructor_id) !== String(req.user.id)
    ) {
      return sendError(res, 404, "Course not found.");
    }

    const result = await pool.query(
      `SELECT cv.id AS video_id, cv.title, cv.status,
              COUNT(DISTINCT e.student_id)::int AS enrolled_students,
              COUNT(DISTINCT p.user_id) FILTER (
                WHERE p.last_position_seconds > 0
              )::int AS started_students,
              COUNT(DISTINCT p.user_id) FILTER (
                WHERE p.completed
              )::int AS completed_students,
              CASE WHEN COUNT(DISTINCT e.student_id) = 0 THEN NULL
                ELSE ROUND(
                  100.0 * COUNT(DISTINCT p.user_id) FILTER (WHERE p.completed)
                  / COUNT(DISTINCT e.student_id), 1
                )
              END AS completion_percentage,
              ROUND(AVG(
                LEAST(100.0, 100.0 * p.last_position_seconds
                  / NULLIF(p.duration_seconds, 0))
              ) FILTER (WHERE p.duration_seconds > 0)::numeric, 1)
                AS average_watch_percentage
       FROM course_videos cv
       LEFT JOIN enrollments e
         ON e.course_id = cv.course_id
        AND e.status IN ('active', 'completed')
       LEFT JOIN course_video_progress p
         ON p.video_id = cv.id AND p.user_id = e.student_id
       WHERE cv.course_id = $1 AND cv.instructor_id = $2
       GROUP BY cv.id
       ORDER BY cv.created_at DESC`,
      [req.params.courseId, course.rows[0].instructor_id]
    );
    return res.json({ success: true, analytics: result.rows });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  if (!req.file) return sendError(res, 400, "Record a video before uploading.");

  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const description =
    typeof req.body.description === "string" ? req.body.description.trim() : "";
  const courseId = req.params.courseId;
  const status = req.body.status || "published";
  const requestedPosition =
    req.body.position === undefined ? null : Number(req.body.position);
  const requestedLessonId =
    req.body.lesson_id === undefined ||
    req.body.lesson_id === null ||
    req.body.lesson_id === ""
      ? null
      : Number(req.body.lesson_id);
  let storedPath = req.file.path;

  try {
    if (!title || title.length > 200) {
      await fsp.unlink(req.file.path);
      return sendError(res, 400, "Video title must contain 1–200 characters.");
    }
    if (description.length > 4000) {
      await fsp.unlink(req.file.path);
      return sendError(res, 400, "Video description must be no more than 4,000 characters.");
    }
    if (
      requestedPosition !== null &&
      (!Number.isInteger(requestedPosition) ||
        requestedPosition < 1 ||
        requestedPosition > 10000)
    ) {
      await fsp.unlink(req.file.path);
      return sendError(res, 400, "Video position must be between 1 and 10,000.");
    }
    if (
      req.body.lesson_id !== undefined &&
      req.body.lesson_id !== null &&
      req.body.lesson_id !== "" &&
      (!Number.isInteger(requestedLessonId) || requestedLessonId < 1)
    ) {
      await fsp.unlink(req.file.path);
      return sendError(res, 400, "Select a valid course lesson.");
    }
    if (!["draft", "published"].includes(status)) {
      await fsp.unlink(req.file.path);
      return sendError(res, 400, "Video status must be draft or published.");
    }

    const courseResult = await pool.query(
      "SELECT id, instructor_id FROM courses WHERE id = $1",
      [courseId]
    );
    const course = courseResult.rows[0];
    if (!course) {
      await fsp.unlink(req.file.path);
      return sendError(res, 404, "Course not found.");
    }
    if (
      req.user.role !== "instructor" ||
      String(course.instructor_id) !== String(req.user.id)
    ) {
      await fsp.unlink(req.file.path);
      return sendError(res, 403, "You can only add recordings to your own courses.");
    }
    if (requestedLessonId !== null) {
      const lessonResult = await pool.query(
        `SELECT l.id
         FROM lessons l
         JOIN modules m ON m.id = l.module_id
         WHERE l.id = $1 AND m.course_id = $2`,
        [requestedLessonId, courseId]
      );
      if (!lessonResult.rowCount) {
        await fsp.unlink(req.file.path);
        return sendError(res, 400, "The selected lesson must belong to this course.");
      }
    }

    const positionResult = requestedPosition === null
      ? await pool.query(
          "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM course_videos WHERE course_id = $1",
          [courseId]
        )
      : null;
    const position = requestedPosition ?? Number(positionResult.rows[0].position);

    const handle = await fsp.open(req.file.path, "r");
    const header = Buffer.alloc(12);
    let bytesRead;
    try {
      ({ bytesRead } = await handle.read(header, 0, header.length, 0));
    } finally {
      await handle.close();
    }
    const mediaType = header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      ? "video/webm"
      : header.subarray(0, 4).equals(Buffer.from("OggS"))
        ? "video/ogg"
        : bytesRead >= 8 && header.subarray(4, 8).equals(Buffer.from("ftyp"))
          ? "video/mp4"
          : null;
    if (!mediaType) {
      await fsp.unlink(req.file.path);
      return sendError(res, 415, "Recording format could not be identified. Record using WebM, MP4, or Ogg.");
    }

    const storageKey = path.basename(req.file.filename, path.extname(req.file.filename));
    storedPath = path.join(videoDirectory, `${storageKey}${videoExtensions[mediaType]}`);
    await fsp.rename(req.file.path, storedPath);
    const result = await pool.query(
      `INSERT INTO course_videos
         (course_id, instructor_id, lesson_id, title, description, position,
          storage_key, media_type, file_size, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, course_id, lesson_id, title, description, position,
                 media_type, file_size, status, created_at`,
      [
        courseId,
        req.user.id,
        requestedLessonId,
        title,
        description,
        position,
        storageKey,
        mediaType,
        req.file.size,
        status,
      ]
    );
    return res.status(201).json({ success: true, video: result.rows[0] });
  } catch (error) {
    try {
      await fsp.unlink(storedPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        console.error("Course video cleanup failed:", cleanupError.message);
      }
    }
    next(error);
  }
}

async function publish(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE course_videos
       SET status = 'published'
       WHERE id = $1 AND instructor_id = $2
       RETURNING id, course_id, title, status`,
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) {
      return sendError(res, 404, "Draft not found in your courses.");
    }
    return res.json({ success: true, video: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  const title =
    typeof req.body.title === "string" ? req.body.title.trim() : "";
  const status = req.body.status;
  const description =
    typeof req.body.description === "string" ? req.body.description.trim() : null;
  const position =
    req.body.position === undefined ? null : Number(req.body.position);
  const setLesson = Object.hasOwn(req.body, "lesson_id");
  const lessonId =
    !setLesson || req.body.lesson_id === null || req.body.lesson_id === ""
      ? null
      : Number(req.body.lesson_id);
  if (!title || title.length > 200) {
    return sendError(res, 400, "Video title must contain 1–200 characters.");
  }
  if (!["draft", "published"].includes(status)) {
    return sendError(res, 400, "Video status must be draft or published.");
  }
  if (description !== null && description.length > 4000) {
    return sendError(res, 400, "Video description must be no more than 4,000 characters.");
  }
  if (
    position !== null &&
    (!Number.isInteger(position) || position < 1 || position > 10000)
  ) {
    return sendError(res, 400, "Video position must be between 1 and 10,000.");
  }
  if (setLesson && req.body.lesson_id !== null && req.body.lesson_id !== "" &&
      (!Number.isInteger(lessonId) || lessonId < 1)) {
    return sendError(res, 400, "Select a valid course lesson.");
  }

  try {
    const ownedVideo = await pool.query(
      "SELECT course_id FROM course_videos WHERE id = $1 AND instructor_id = $2",
      [req.params.id, req.user.id]
    );
    if (!ownedVideo.rowCount) {
      return sendError(res, 404, "Video not found in your courses.");
    }
    if (setLesson && lessonId !== null) {
      const lessonResult = await pool.query(
        `SELECT l.id FROM lessons l
         JOIN modules m ON m.id = l.module_id
         WHERE l.id = $1 AND m.course_id = $2`,
        [lessonId, ownedVideo.rows[0].course_id]
      );
      if (!lessonResult.rowCount) {
        return sendError(res, 400, "The selected lesson must belong to this course.");
      }
    }
    const result = await pool.query(
      `UPDATE course_videos
       SET title = $1, status = $2,
           description = COALESCE($3, description),
           position = COALESCE($4, position),
           lesson_id = CASE WHEN $5 THEN $6 ELSE lesson_id END
       WHERE id = $7 AND instructor_id = $8
       RETURNING id, course_id, lesson_id, title, description, position,
                 status, media_type, file_size, created_at`,
      [
        title,
        status,
        description,
        position,
        setLesson,
        lessonId,
        req.params.id,
        req.user.id,
      ]
    );
    if (!result.rowCount) {
      return sendError(res, 404, "Video not found in your courses.");
    }
    return res.json({ success: true, video: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  const client = await pool.connect();
  let transactionOpen = false;
  let transactionCommitted = false;
  let originalFilePath;
  let quarantinedFilePath;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const result = await client.query(
      `SELECT storage_key, media_type
       FROM course_videos
       WHERE id = $1 AND instructor_id = $2
       FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    const video = result.rows[0];
    if (!video) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return sendError(res, 404, "Video not found in your courses.");
    }

    const extension = videoExtensions[video.media_type];
    if (!extension) {
      throw new Error("Cannot safely remove a video with an unsupported media type.");
    }
    originalFilePath = path.join(
      videoDirectory,
      `${video.storage_key}${extension}`
    );
    quarantinedFilePath = path.join(
      videoDirectory,
      `.${path.basename(originalFilePath)}.${crypto.randomUUID()}.deleting`
    );
    try {
      await fsp.rename(originalFilePath, quarantinedFilePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      quarantinedFilePath = null;
    }

    await client.query(
      "DELETE FROM course_videos WHERE id = $1 AND instructor_id = $2",
      [req.params.id, req.user.id]
    );
    await client.query("COMMIT");
    transactionOpen = false;
    transactionCommitted = true;

    if (quarantinedFilePath) await fsp.unlink(quarantinedFilePath);
    return res.json({ success: true, message: "Video deleted." });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch((rollbackError) => {
        console.error("Course video delete rollback failed:", rollbackError.message);
      });
    }
    if (!transactionCommitted && quarantinedFilePath && originalFilePath) {
      await fsp.rename(quarantinedFilePath, originalFilePath).catch((restoreError) => {
        if (restoreError.code !== "ENOENT") {
          console.error("Course video file restore failed:", restoreError.message);
        }
      });
    }
    next(error);
  } finally {
    client.release();
  }
}

async function createPlaybackLink(req, res, next) {
  try {
    const video = await getVideoAccess(req.user.id, req.params.id);
    if (!video) return sendError(res, 404, "Video not found or access is not allowed.");

    const token = jwt.sign(
      { purpose: "course-video-playback", video_id: String(video.id) },
      getJwtSecret(),
      {
        subject: String(req.user.id),
        issuer: "learnsphere-course-video",
        audience: "learnsphere-course-video-stream",
        expiresIn: "4h",
        algorithm: "HS256",
      }
    );

    return res.json({
      success: true,
      path: `course-videos/${video.id}/stream?token=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    next(error);
  }
}

async function stream(req, res, next) {
  try {
    let claims;
    try {
      claims = jwt.verify(req.query.token, getJwtSecret(), {
        issuer: "learnsphere-course-video",
        audience: "learnsphere-course-video-stream",
        algorithms: ["HS256"],
      });
    } catch {
      return sendError(res, 401, "Video playback link is invalid or expired.");
    }

    if (
      claims.purpose !== "course-video-playback" ||
      claims.video_id !== String(req.params.id) ||
      typeof claims.sub !== "string"
    ) {
      return sendError(res, 401, "Video playback link is invalid or expired.");
    }

    const video = await getVideoAccess(claims.sub, req.params.id);
    if (!video) return sendError(res, 404, "Video not found or access is not allowed.");

    const extension = videoExtensions[video.media_type];
    if (!extension) return sendError(res, 415, "Unsupported video format.");
    const filePath = path.join(
      videoDirectory,
      `${video.storage_key}${extension}`
    );
    const stat = await fsp.stat(filePath);
    const range = req.headers.range;

    res.set({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Type": video.media_type,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    });

    if (!range) {
      res.set("Content-Length", stat.size);
      const readStream = fs.createReadStream(filePath);
      readStream.on("error", next);
      return readStream.pipe(res);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.set("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }

    let start;
    let end;
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      start = Math.max(0, stat.size - suffixLength);
      end = stat.size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : stat.size - 1;
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= stat.size
    ) {
      res.set("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }

    end = Math.min(end, stat.size - 1);
    res.status(206);
    res.set({
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    });
    const readStream = fs.createReadStream(filePath, { start, end });
    readStream.on("error", next);
    return readStream.pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendError(res, 404, "Video file is no longer available.");
    }
    next(error);
  }
}

const uploadDirectory = videoDirectory;

module.exports = {
  list,
  getProgress,
  saveProgress,
  getCourseAnalytics,
  create,
  publish,
  update,
  remove,
  createPlaybackLink,
  stream,
  uploadDirectory,
  videoExtensions,
};
