const { pool } = require("../config/db");
const {
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

function validateModule(body, partial = false) {
  const data = {};
  const errors = [];

  if (!partial || body.title !== undefined) {
    if (
      typeof body.title !== "string" ||
      body.title.trim().length < 2 ||
      body.title.trim().length > 200
    ) {
      errors.push("Module title must contain 2–200 characters.");
    } else {
      data.title = body.title.trim();
    }
  }

  if (!partial || body.description !== undefined) {
    if (body.description == null || body.description === "") {
      data.description = null;
    } else if (
      typeof body.description !== "string" ||
      body.description.trim().length > 5000
    ) {
      errors.push("Module description must not exceed 5,000 characters.");
    } else {
      data.description = body.description.trim();
    }
  }

  return { data, errors };
}

async function listModules(req, res) {
  try {
    const { courseId } = req.params;

    if (!positiveId(courseId)) {
      return sendError(res, 400, "Invalid course ID.");
    }

    const access = await checkCourseAccess(req.user, courseId);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        access.reason === "not_found"
          ? "Course not found."
          : "You cannot access this course."
      );
    }

    const result = await pool.query(
      `SELECT
         m.id,
         m.course_id,
         m.title,
         m.description,
         m.position,
         COUNT(l.id)::int AS lesson_count
       FROM modules m
       LEFT JOIN lessons l ON l.module_id = m.id
       WHERE m.course_id = $1
       GROUP BY m.id
       ORDER BY m.position ASC, m.id ASC`,
      [courseId]
    );

    return res.status(200).json({
      success: true,
      modules: result.rows,
    });
  } catch (error) {
    console.error("List modules error:", error.message);
    return sendError(res, 500, "Unable to load course modules.");
  }
}

async function createModule(req, res) {
  try {
    const { courseId } = req.params;

    if (!positiveId(courseId)) {
      return sendError(res, 400, "Invalid course ID.");
    }

    const access = await checkCourseAccess(req.user, courseId);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        access.reason === "not_found"
          ? "Course not found."
          : "You cannot manage this course."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "Only course managers can add modules.");
    }

    const { data, errors } = validateModule(req.body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid module details.",
        errors,
      });
    }

    const result = await pool.query(
      `INSERT INTO modules (course_id, title, description, position)
       VALUES (
         $1, $2, $3,
         (SELECT COALESCE(MAX(position), 0) + 1
          FROM modules WHERE course_id = $1)
       )
       RETURNING id, course_id, title, description, position`,
      [courseId, data.title, data.description]
    );

    return res.status(201).json({
      success: true,
      message: "Module created successfully.",
      module: result.rows[0],
    });
  } catch (error) {
    console.error("Create module error:", error.message);
    return sendError(res, 500, "Unable to create the module.");
  }
}

async function updateModule(req, res) {
  try {
    const { id } = req.params;

    if (!positiveId(id)) {
      return sendError(res, 400, "Invalid module ID.");
    }

    const access = await checkModuleAccess(req.user, id);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Module not found or access denied."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "You cannot edit this module.");
    }

    const { data, errors } = validateModule(req.body, true);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid module details.",
        errors,
      });
    }

    const fields = [];
    const values = [];

    for (const field of ["title", "description"]) {
      if (data[field] !== undefined) {
        values.push(data[field]);
        fields.push(`${field} = $${values.length}`);
      }
    }

    if (fields.length === 0) {
      return sendError(res, 400, "Provide a title or description to update.");
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE modules
       SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING id, course_id, title, description, position`,
      values
    );

    return res.status(200).json({
      success: true,
      message: "Module updated successfully.",
      module: result.rows[0],
    });
  } catch (error) {
    console.error("Update module error:", error.message);
    return sendError(res, 500, "Unable to update the module.");
  }
}

async function deleteModule(req, res) {
  try {
    const { id } = req.params;

    if (!positiveId(id)) {
      return sendError(res, 400, "Invalid module ID.");
    }

    const access = await checkModuleAccess(req.user, id);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Module not found or access denied."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "You cannot delete this module.");
    }

    await pool.query("DELETE FROM modules WHERE id = $1", [id]);

    return res.status(200).json({
      success: true,
      message: "Module and its dependent lessons deleted successfully.",
    });
  } catch (error) {
    console.error("Delete module error:", error.message);
    return sendError(res, 500, "Unable to delete the module.");
  }
}

async function reorderModules(req, res) {
  const client = await pool.connect();

  try {
    const { courseId } = req.params;
    const { moduleIds } = req.body;

    if (!positiveId(courseId)) {
      return sendError(res, 400, "Invalid course ID.");
    }

    if (
      !Array.isArray(moduleIds) ||
      moduleIds.some((id) => !positiveId(String(id))) ||
      new Set(moduleIds.map(String)).size !== moduleIds.length
    ) {
      return sendError(
        res,
        400,
        "moduleIds must be an array of unique positive module IDs."
      );
    }

    const access = await checkCourseAccess(req.user, courseId);

    if (!access.allowed) {
      return sendError(
        res,
        access.reason === "not_found" ? 404 : 403,
        "Course not found or access denied."
      );
    }

    if (!access.manager) {
      return sendError(res, 403, "You cannot reorder this course.");
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id
       FROM modules
       WHERE course_id = $1
       ORDER BY position, id`,
      [courseId]
    );

    const existingIds = existing.rows.map((row) => String(row.id));
    const requestedIds = moduleIds.map(String);

    if (
      existingIds.length !== requestedIds.length ||
      existingIds.some((id) => !requestedIds.includes(id))
    ) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        400,
        "moduleIds must contain every module in this course exactly once."
      );
    }

    // Move positions out of the positive range first to avoid collisions
    // with the unique (course_id, position) constraint.
    await client.query(
      `UPDATE modules
       SET position = -position - 1
       WHERE course_id = $1`,
      [courseId]
    );

    for (let index = 0; index < requestedIds.length; index += 1) {
      await client.query(
        `UPDATE modules
         SET position = $1
         WHERE id = $2 AND course_id = $3`,
        [index + 1, requestedIds[index], courseId]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Module order updated successfully.",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Reorder modules error:", error.message);
    return sendError(res, 500, "Unable to reorder modules.");
  } finally {
    client.release();
  }
}

module.exports = {
  listModules,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
};