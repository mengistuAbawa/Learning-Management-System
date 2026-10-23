const { pool } = require("../config/db");
const {
  checkModuleAccess,
  checkCourseAccess,
} = require("../services/courseAccess");

function positiveId(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateLesson(body, partial = false) {
  const data = {};
  const errors = [];

  if (!partial || body.title !== undefined) {
    if (
      typeof body.title !== "string" ||
      body.title.trim().length < 2 ||
      body.title.trim().length > 200
    ) {
      errors.push("Lesson title must contain 2–200 characters.");
    } else {
      data.title = body.title.trim();
    }
  }

  if (!partial || body.content !== undefined) {
    if (
      typeof body.content !== "string" ||
      body.content.trim().length < 1 ||
      body.content.length > 100000
    ) {
      errors.push("Lesson content must contain 1–100,000 characters.");
    } else {
      data.content = body.content.trim();
    }
  }

  for (const field of ["video_url", "resource_url"]) {
    if (!partial || body[field] !== undefined) {
      const value = body[field];

      if (value === null || value === "") {
        data[field] = null;
      } else if (
        typeof value === "string" &&
        value.length <= 2048 &&
        isHttpUrl(value.trim())
      ) {
        data[field] = value.trim();
      } else {
        errors.push(`${field} must be a valid HTTP or HTTPS URL.`);
      }
    }
  }

  if (!partial || body.duration_minutes !== undefined) {
    const duration = body.duration_minutes === undefined
      ? 0
      : Number(body.duration_minutes);

    if (
      !Number.isInteger(duration) ||
      duration < 0 ||
      duration > 10000
    ) {
      errors.push("Duration must be a whole number between 0 and 10,000.");
    } else {
      data.duration_minutes = duration;
    }
  }

  if (!partial || body.is_preview !== undefined) {
    const preview = body.is_preview === undefined
      ? false
      : body.is_preview;

    if (typeof preview !== "boolean") {
      errors.push("is_preview must be true or false.");
    } else {
      data.is_preview = preview;
    }
  }

  return { data, errors };
}

function lessonSummary(row, includeContent) {
  const lesson = {
    id: row.id,
    module_id: row.module_id,
    title: row.title,
    video_url: includeContent ? row.video_url : null,
    resource_url: includeContent ? row.resource_url : null,
    duration_minutes: row.duration_minutes,
    is_preview: row.is_preview,
    position: row.position,
  };

  if (includeContent) {
    lesson.content = row.content;
  }

  return lesson;
}

async function listLessons(req, res) {
  try {
    const { moduleId } = req.params;

    if (!positiveId(moduleId)) {
      return sendError(res, 400, "Invalid module ID.");
    }

    const access = await checkModuleAccess(req.user, moduleId);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Module not found or access denied."
      );
    }

    const result = await pool.query(
      `SELECT id, module_id, title, content, video_url, resource_url,
              duration_minutes, is_preview, position
       FROM lessons
       WHERE module_id = $1
       ORDER BY position ASC, id ASC`,
      [moduleId]
    );

    const canViewFullContent = access.manager || access.enrolled;

    return res.status(200).json({
      success: true,
      lessons: result.rows.map((lesson) =>
        lessonSummary(
          lesson,
          canViewFullContent || lesson.is_preview
        )
      ),
    });
  } catch (error) {
    console.error("List lessons error:", error.message);
    return sendError(res, 500, "Unable to load lessons.");
  }
}

async function getLessonById(req, res) {
  try {
    const { id } = req.params;

    if (!positiveId(id)) {
      return sendError(res, 400, "Invalid lesson ID.");
    }

    const result = await pool.query(
      `SELECT l.id, l.module_id, l.title, l.content, l.video_url,
              l.resource_url, l.duration_minutes, l.is_preview, l.position,
              m.course_id
       FROM lessons l
       JOIN modules m ON m.id = l.module_id
       WHERE l.id = $1
       LIMIT 1`,
      [id]
    );

    const lesson = result.rows[0];

    if (!lesson) {
      return sendError(res, 404, "Lesson not found.");
    }

    const access = await checkCourseAccess(
      req.user,
      lesson.course_id
    );

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "You cannot access this lesson."
      );
    }

    if (
      !access.manager &&
      !access.enrolled &&
      !lesson.is_preview
    ) {
      return sendError(
        res,
        403,
        "Enroll in this course to access the full lesson."
      );
    }

    return res.status(200).json({
      success: true,
      lesson: lessonSummary(lesson, true),
    });
  } catch (error) {
    console.error("Get lesson error:", error.message);
    return sendError(res, 500, "Unable to load the lesson.");
  }
}

async function createLesson(req, res) {
  try {
    const { moduleId } = req.params;

    if (!positiveId(moduleId)) {
      return sendError(res, 400, "Invalid module ID.");
    }

    const access = await checkModuleAccess(req.user, moduleId);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Module not found or access denied."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "You cannot add lessons to this module.");
    }

    const { data, errors } = validateLesson(req.body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid lesson details.",
        errors,
      });
    }

    const result = await pool.query(
      `INSERT INTO lessons
         (module_id, title, content, video_url, resource_url,
          duration_minutes, is_preview, position)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         (SELECT COALESCE(MAX(position), 0) + 1
          FROM lessons WHERE module_id = $1)
       )
       RETURNING id, module_id, title, content, video_url,
                 resource_url, duration_minutes, is_preview, position`,
      [
        moduleId,
        data.title,
        data.content,
        data.video_url,
        data.resource_url,
        data.duration_minutes,
        data.is_preview,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Lesson created successfully.",
      lesson: result.rows[0],
    });
  } catch (error) {
    console.error("Create lesson error:", error.message);
    return sendError(res, 500, "Unable to create the lesson.");
  }
}

async function updateLesson(req, res) {
  try {
    const { id } = req.params;

    if (!positiveId(id)) {
      return sendError(res, 400, "Invalid lesson ID.");
    }

    const result = await pool.query(
      `SELECT l.id, l.module_id
       FROM lessons l
       WHERE l.id = $1
       LIMIT 1`,
      [id]
    );

    const existing = result.rows[0];

    if (!existing) {
      return sendError(res, 404, "Lesson not found.");
    }

    const access = await checkModuleAccess(
      req.user,
      existing.module_id
    );

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Lesson not found or access denied."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "You cannot edit this lesson.");
    }

    const { data, errors } = validateLesson(req.body, true);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid lesson details.",
        errors,
      });
    }

    const fields = [];
    const values = [];

    for (const field of [
      "title",
      "content",
      "video_url",
      "resource_url",
      "duration_minutes",
      "is_preview",
    ]) {
      if (data[field] !== undefined) {
        values.push(data[field]);
        fields.push(`${field} = $${values.length}`);
      }
    }

    if (!fields.length) {
      return sendError(res, 400, "Provide at least one lesson field to update.");
    }

    values.push(id);

    const updated = await pool.query(
      `UPDATE lessons
       SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING id, module_id, title, content, video_url,
                 resource_url, duration_minutes, is_preview, position`,
      values
    );

    return res.status(200).json({
      success: true,
      message: "Lesson updated successfully.",
      lesson: updated.rows[0],
    });
  } catch (error) {
    console.error("Update lesson error:", error.message);
    return sendError(res, 500, "Unable to update the lesson.");
  }
}

async function deleteLesson(req, res) {
  try {
    const { id } = req.params;

    if (!positiveId(id)) {
      return sendError(res, 400, "Invalid lesson ID.");
    }

    const result = await pool.query(
      "SELECT id, module_id FROM lessons WHERE id = $1 LIMIT 1",
      [id]
    );

    const lesson = result.rows[0];

    if (!lesson) {
      return sendError(res, 404, "Lesson not found.");
    }

    const access = await checkModuleAccess(
      req.user,
      lesson.module_id
    );

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Lesson not found or access denied."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "You cannot delete this lesson.");
    }

    await pool.query("DELETE FROM lessons WHERE id = $1", [id]);

    return res.status(200).json({
      success: true,
      message: "Lesson deleted successfully.",
    });
  } catch (error) {
    if (error.code === "23503") {
      return sendError(
        res,
        409,
        "This lesson is referenced by learning records and cannot be deleted."
      );
    }

    console.error("Delete lesson error:", error.message);
    return sendError(res, 500, "Unable to delete the lesson.");
  }
}
function lessonSummary(row, includeContent) {
  const lesson = {
    id: row.id,
    module_id: row.module_id,
    title: row.title,
    video_url: includeContent ? row.video_url : null,
    resource_url: includeContent ? row.resource_url : null,
    duration_minutes: row.duration_minutes,
    is_preview: row.is_preview,
    position: row.position,
  };

  if (includeContent) {
    lesson.content = row.content;
  }

  return lesson;
}
async function reorderLessons(req, res) {
  const client = await pool.connect();

  try {
    const { moduleId } = req.params;
    const { lessonIds } = req.body;

    if (!positiveId(moduleId)) {
      return sendError(res, 400, "Invalid module ID.");
    }

    if (
      !Array.isArray(lessonIds) ||
      lessonIds.some((id) => !positiveId(String(id))) ||
      new Set(lessonIds.map(String)).size !== lessonIds.length
    ) {
      return sendError(
        res,
        400,
        "lessonIds must be an array of unique positive lesson IDs."
      );
    }

    const access = await checkModuleAccess(req.user, moduleId);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Module not found or access denied."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "You cannot reorder these lessons.");
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id
       FROM lessons
       WHERE module_id = $1
       ORDER BY position, id`,
      [moduleId]
    );

    const existingIds = existing.rows.map((row) => String(row.id));
    const requestedIds = lessonIds.map(String);

    if (
      existingIds.length !== requestedIds.length ||
      existingIds.some((id) => !requestedIds.includes(id))
    ) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        400,
        "lessonIds must contain every lesson in this module exactly once."
      );
    }

    await client.query(
      `UPDATE lessons
       SET position = -position - 1
       WHERE module_id = $1`,
      [moduleId]
    );

    for (let index = 0; index < requestedIds.length; index += 1) {
      await client.query(
        `UPDATE lessons
         SET position = $1
         WHERE id = $2 AND module_id = $3`,
        [index + 1, requestedIds[index], moduleId]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Lesson order updated successfully.",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Reorder lessons error:", error.message);
    return sendError(res, 500, "Unable to reorder lessons.");
  } finally {
    client.release();
  }
}

module.exports = {
  listLessons,
  getLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
};