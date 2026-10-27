const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pool } = require("../config/db");

const materialDirectory = path.resolve(
  __dirname,
  "..",
  "..",
  "storage",
  "course-materials"
);
const materialTypes = {
  ".pdf": {
    mediaType: "application/pdf",
    signature: (header) => header.subarray(0, 5).equals(Buffer.from("%PDF-")),
  },
  ".doc": {
    mediaType: "application/msword",
    signature: (header) =>
      header.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
  ".docx": {
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: (header) => header.subarray(0, 4).equals(Buffer.from("PK\u0003\u0004")),
  },
  ".ppt": {
    mediaType: "application/vnd.ms-powerpoint",
    signature: (header) =>
      header.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
  ".pptx": {
    mediaType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    signature: (header) => header.subarray(0, 4).equals(Buffer.from("PK\u0003\u0004")),
  },
};

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function extensionFor(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const materialType = materialTypes[extension];
  if (!materialType) return null;

  const declaredType = file.mimetype.toLowerCase();
  const acceptedTypes = {
    ".pdf": ["application/pdf"],
    ".doc": ["application/msword", "application/octet-stream"],
    ".docx": [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/octet-stream",
    ],
    ".ppt": ["application/vnd.ms-powerpoint", "application/octet-stream"],
    ".pptx": [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
      "application/octet-stream",
    ],
  }[extension];

  return acceptedTypes.includes(declaredType) ? { extension, ...materialType } : null;
}

async function removeUpload(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Course material cleanup failed:", error.message);
    }
  }
}

async function listForLesson(req, res, next) {
  try {
    const lessonResult = await pool.query(
      `SELECT l.id AS lesson_id, l.is_preview, m.course_id,
              c.instructor_id, c.status AS course_status
       FROM lessons l
       JOIN modules m ON m.id = l.module_id
       JOIN courses c ON c.id = m.course_id
       WHERE l.id = $1`,
      [req.params.lessonId]
    );
    const lesson = lessonResult.rows[0];
    if (!lesson) return sendError(res, 404, "Lesson not found.");

    const manager =
      req.user.role === "admin" ||
      (req.user.role === "instructor" &&
        String(lesson.instructor_id) === String(req.user.id));
    if (!manager && req.user.role !== "student") {
      return sendError(res, 403, "You cannot access course materials.");
    }
    if (!manager) {
      const enrollment = await pool.query(
        `SELECT 1 FROM enrollments
         WHERE student_id = $1 AND course_id = $2
           AND status IN ('active', 'completed')
         LIMIT 1`,
        [req.user.id, lesson.course_id]
      );
      if (
        !enrollment.rowCount &&
        !(lesson.is_preview && lesson.course_status === "published")
      ) {
        return sendError(res, 403, "Enroll in this course to access its materials.");
      }
    }

    const materials = await pool.query(
      `SELECT id, lesson_id, title, original_filename, media_type, file_size,
              status, created_at
       FROM course_materials
       WHERE lesson_id = $1 ${manager ? "" : "AND status = 'published'"}
       ORDER BY created_at DESC, id DESC`,
      [req.params.lessonId]
    );
    return res.json({ success: true, materials: materials.rows });
  } catch (error) {
    next(error);
  }
}

async function listForCourse(req, res, next) {
  try {
    const course = await pool.query(
      "SELECT instructor_id FROM courses WHERE id = $1",
      [req.params.courseId]
    );
    if (!course.rowCount) return sendError(res, 404, "Course not found.");
    if (
      req.user.role !== "admin" &&
      (req.user.role !== "instructor" ||
        String(course.rows[0].instructor_id) !== String(req.user.id))
    ) {
      return sendError(res, 403, "You can only manage materials in your own courses.");
    }

    const materials = await pool.query(
      `SELECT cm.id, cm.lesson_id, cm.title, cm.original_filename,
              cm.media_type, cm.file_size, cm.status, cm.created_at,
              l.title AS lesson_title, m.title AS module_title
       FROM course_materials cm
       JOIN lessons l ON l.id = cm.lesson_id
       JOIN modules m ON m.id = l.module_id
       WHERE cm.course_id = $1
       ORDER BY cm.created_at DESC, cm.id DESC
       LIMIT 200`,
      [req.params.courseId]
    );
    return res.json({ success: true, materials: materials.rows });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  if (!req.file) return sendError(res, 400, "Choose a document to upload.");
  let storedPath = req.file.path;
  try {
    const courseId = req.params.courseId;
    const lessonId = Number(req.body.lesson_id);
    const title =
      typeof req.body.title === "string"
        ? req.body.title.trim()
        : path.basename(req.file.originalname, path.extname(req.file.originalname));
    const status = req.body.status || "published";

    if (!Number.isInteger(lessonId) || lessonId < 1) {
      await removeUpload(req.file.path);
      return sendError(res, 400, "Select a valid lesson for this material.");
    }
    if (!title || title.length > 200) {
      await removeUpload(req.file.path);
      return sendError(res, 400, "Material title must contain 1–200 characters.");
    }
    if (!["draft", "published"].includes(status)) {
      await removeUpload(req.file.path);
      return sendError(res, 400, "Material status must be draft or published.");
    }

    const course = await pool.query(
      "SELECT instructor_id FROM courses WHERE id = $1",
      [courseId]
    );
    if (!course.rowCount) {
      await removeUpload(req.file.path);
      return sendError(res, 404, "Course not found.");
    }
    if (
      req.user.role !== "instructor" ||
      String(course.rows[0].instructor_id) !== String(req.user.id)
    ) {
      await removeUpload(req.file.path);
      return sendError(res, 403, "You can only upload materials to your own courses.");
    }

    const lesson = await pool.query(
      `SELECT l.id
       FROM lessons l
       JOIN modules m ON m.id = l.module_id
       WHERE l.id = $1 AND m.course_id = $2`,
      [lessonId, courseId]
    );
    if (!lesson.rowCount) {
      await removeUpload(req.file.path);
      return sendError(res, 400, "The selected lesson must belong to this course.");
    }

    const type = extensionFor(req.file);
    if (!type) {
      await removeUpload(req.file.path);
      return sendError(res, 415, "Choose a PDF, DOC, DOCX, PPT, or PPTX file.");
    }
    const handle = await fsp.open(req.file.path, "r");
    const header = Buffer.alloc(8);
    let bytesRead;
    try {
      ({ bytesRead } = await handle.read(header, 0, header.length, 0));
    } finally {
      await handle.close();
    }
    if (!bytesRead || !type.signature(header)) {
      await removeUpload(req.file.path);
      return sendError(res, 415, "The file content does not match its document type.");
    }

    const storageKey = crypto.randomUUID();
    storedPath = path.join(materialDirectory, `${storageKey}${type.extension}`);
    await fsp.rename(req.file.path, storedPath);
    const originalName = path
      .basename(req.file.originalname)
      .replace(/[\r\n"]/g, "_");
    const fileExtension = path.extname(originalName);
    const filename =
      originalName.length > 255
        ? `${originalName.slice(0, 255 - fileExtension.length - 1)}${fileExtension}`
        : originalName;
    const result = await pool.query(
      `INSERT INTO course_materials
         (course_id, lesson_id, instructor_id, title, original_filename,
          storage_key, media_type, file_size, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, course_id, lesson_id, title, original_filename,
                 media_type, file_size, status, created_at`,
      [
        courseId,
        lessonId,
        req.user.id,
        title,
        filename,
        storageKey,
        type.mediaType,
        req.file.size,
        status,
      ]
    );
    return res.status(201).json({ success: true, material: result.rows[0] });
  } catch (error) {
    await removeUpload(storedPath);
    next(error);
  }
}

async function publish(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE course_materials cm
       SET status = 'published'
       FROM courses c
       WHERE cm.id = $1 AND c.id = cm.course_id
         AND (c.instructor_id = $2 OR $3 = 'admin')
       RETURNING cm.id, cm.status`,
      [req.params.id, req.user.id, req.user.role]
    );
    if (!result.rowCount) {
      return sendError(res, 404, "Material not found or you cannot publish it.");
    }
    return res.json({ success: true, material: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const result = await pool.query(
      `DELETE FROM course_materials cm
       USING courses c
       WHERE cm.id = $1 AND c.id = cm.course_id
         AND (c.instructor_id = $2 OR $3 = 'admin')
       RETURNING cm.storage_key, cm.original_filename`,
      [req.params.id, req.user.id, req.user.role]
    );
    const material = result.rows[0];
    if (!material) return sendError(res, 404, "Material not found or access denied.");

    await removeUpload(
      path.join(
        materialDirectory,
        `${material.storage_key}${path.extname(material.original_filename).toLowerCase()}`
      )
    );
    return res.json({ success: true, message: "Course material deleted." });
  } catch (error) {
    next(error);
  }
}

async function download(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT cm.id, cm.course_id, cm.instructor_id, cm.original_filename,
              cm.storage_key, cm.media_type, cm.status,
              c.instructor_id AS course_instructor_id,
              c.status AS course_status, l.is_preview
       FROM course_materials cm
       JOIN courses c ON c.id = cm.course_id
       JOIN lessons l ON l.id = cm.lesson_id
       WHERE cm.id = $1`,
      [req.params.id]
    );
    const material = result.rows[0];
    if (!material) return sendError(res, 404, "Material not found.");
    const manager =
      req.user.role === "admin" ||
      (req.user.role === "instructor" &&
        String(material.course_instructor_id) === String(req.user.id));
    if (!manager) {
      if (req.user.role !== "student" || material.status !== "published") {
        return sendError(res, 403, "You cannot access this material.");
      }
      const enrollment = await pool.query(
        `SELECT 1 FROM enrollments
         WHERE student_id = $1 AND course_id = $2
           AND status IN ('active', 'completed')
         LIMIT 1`,
        [req.user.id, material.course_id]
      );
      if (
        !enrollment.rowCount &&
        !(material.is_preview && material.course_status === "published")
      ) {
        return sendError(res, 403, "Enroll in this course to download its materials.");
      }
    }

    const filePath = path.join(
      materialDirectory,
      `${material.storage_key}${path.extname(material.original_filename).toLowerCase()}`
    );
    await fsp.access(filePath, fs.constants.R_OK);
    const fallbackFilename = material.original_filename.replace(
      /[^\x20-\x7e]|["\\;]/g,
      "_"
    );
    res.set({
      "Content-Type": material.media_type,
      "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(material.original_filename)}`,
      "Content-Length": String((await fsp.stat(filePath)).size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    const stream = fs.createReadStream(filePath);
    stream.on("error", next);
    return stream.pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendError(res, 404, "The uploaded file is no longer available.");
    }
    next(error);
  }
}

module.exports = {
  materialDirectory,
  materialTypes,
  extensionFor,
  listForLesson,
  listForCourse,
  create,
  publish,
  remove,
  download,
};
