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
    `SELECT cv.id, cv.course_id, cv.instructor_id, cv.title,
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
      `SELECT cv.id, cv.course_id, cv.title, cv.media_type, cv.status,
              cv.file_size, cv.created_at, c.title AS course_title,
              u.full_name AS instructor_name
       FROM course_videos cv
       JOIN courses c ON c.id = cv.course_id
       JOIN users u ON u.id = cv.instructor_id
       ${filter}
       ORDER BY cv.created_at DESC
       LIMIT 100`,
      req.user.role === "admin" ? [] : [req.user.id]
    );
    return res.json({ success: true, videos: result.rows });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  if (!req.file) return sendError(res, 400, "Record a video before uploading.");

  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const courseId = req.params.courseId;
  const status = req.body.status || "published";
  let storedPath = req.file.path;

  try {
    if (!title || title.length > 200) {
      await fsp.unlink(req.file.path);
      return sendError(res, 400, "Video title must contain 1–200 characters.");
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
         (course_id, instructor_id, title, storage_key, media_type, file_size, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, course_id, title, media_type, file_size, status, created_at`,
      [
        courseId,
        req.user.id,
        title,
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
  create,
  publish,
  createPlaybackLink,
  stream,
  uploadDirectory,
  videoExtensions,
};
