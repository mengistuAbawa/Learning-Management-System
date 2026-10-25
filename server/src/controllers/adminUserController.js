const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

const SALT_ROUNDS = 12;

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function createStudent(req, res, next) {
  try {
    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'student')
       RETURNING id, full_name, email, role, avatar_url,
                 bio, is_active, approval_status, created_at`,
      [
        req.body.full_name.trim(),
        req.body.email.trim().toLowerCase(),
        passwordHash,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Student account created successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return sendError(res, 409, "An account with this email already exists.");
    }
    return next(error);
  }
}

async function getRecentUsers(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, is_active, approval_status, created_at
       FROM users
       ORDER BY created_at DESC, id DESC
       LIMIT 8`
    );
    return res.json({ success: true, users: result.rows });
  } catch (error) {
    next(error);
  }
}

async function getManagedAccounts(req, res, next) {
  const role = req.query.role;
  if (!["student", "instructor"].includes(role)) {
    return sendError(res, 400, "role must be student or instructor.");
  }

  const rawLimit = req.query.limit === undefined ? "25" : String(req.query.limit);
  const rawOffset = req.query.offset === undefined ? "0" : String(req.query.offset);
  if (!/^[1-9]\d*$/.test(rawLimit) || !/^(0|[1-9]\d*)$/.test(rawOffset)) {
    return sendError(res, 400, "limit and offset must be valid positive integers.");
  }

  const limit = Math.min(Number(rawLimit), 100);
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) {
    return sendError(res, 400, "limit or offset is outside the supported range.");
  }

  try {
    const [users, count] = await Promise.all([
      pool.query(
        `SELECT id, full_name, email, role, avatar_url, bio,
               is_active, approval_status, approval_reviewed_at,
               approval_reviewed_by, approval_reason, created_at, updated_at
         FROM users
         WHERE role = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [role, limit, offset]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = $1",
        [role]
      ),
    ]);
    const total = count.rows[0].total;
    return res.json({
      success: true,
      users: users.rows,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + users.rows.length < total,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getPendingStudents(req, res, next) {
  try {
    const result = await pool.query(
      `      SELECT id, full_name, email, approval_reviewed_at,
             approval_reviewed_by, approval_reason, created_at
       FROM users
       WHERE role = 'student' AND approval_status = 'pending'
       ORDER BY created_at ASC, id ASC`
    );

    return res.json({ success: true, students: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function getPendingInstructors(req, res, next) {
  try {
    const result = await pool.query(
      `      SELECT id, full_name, email, approval_reviewed_at,
             approval_reviewed_by, approval_reason, created_at
       FROM users
       WHERE role = 'instructor' AND approval_status = 'pending'
       ORDER BY created_at ASC, id ASC`
    );
    return res.json({ success: true, instructors: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function updateStudentApproval(req, res, next) {
  const { approval_status: approvalStatus } = req.body;
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const target = await client.query(
      `SELECT id, full_name, role, approval_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id]
    );

    if (!target.rowCount || target.rows[0].role !== "student") {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Pending student registration not found.");
    }

    if (target.rows[0].approval_status !== "pending") {
      await client.query("ROLLBACK");
      return sendError(res, 409, "This student registration has already been reviewed.");
    }

    const result = await client.query(
      `UPDATE users
       SET approval_status = $2,
           approval_reviewed_at = NOW(),
           approval_reviewed_by = $3,
           approval_reason = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, role, is_active, approval_status,
                 approval_reviewed_at, approval_reviewed_by, approval_reason, created_at`,
      [req.params.id, approvalStatus, req.user.id, req.body.reason?.trim() || null]
    );

    const approved = approvalStatus === "approved";
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, link_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.params.id,
        approved ? "registration_approved" : "registration_rejected",
        approved ? "Registration approved" : "Registration not approved",
        approved
          ? "Your student account is approved. You can now sign in and browse courses."
          : `Your student registration was not approved.${req.body.reason?.trim() ? ` Reason: ${req.body.reason.trim()}` : " Contact an administrator for more information."}`,
        approved ? "/dashboard" : "/login",
      ]
    );

    await client.query("COMMIT");
    return res.json({
      success: true,
      user: result.rows[0],
      message: approved ? "Student registration approved." : "Student registration rejected.",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    return next(error);
  } finally {
    if (client) client.release();
  }
}

async function updateInstructorApproval(req, res, next) {
  const { approval_status: approvalStatus } = req.body;
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const target = await client.query(
      `SELECT id, role, approval_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id]
    );

    if (!target.rowCount || target.rows[0].role !== "instructor") {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Pending instructor application not found.");
    }
    if (target.rows[0].approval_status !== "pending") {
      await client.query("ROLLBACK");
      return sendError(res, 409, "This instructor application has already been reviewed.");
    }

    const result = await client.query(
      `UPDATE users
       SET approval_status = $2,
           approval_reviewed_at = NOW(),
           approval_reviewed_by = $3,
           approval_reason = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, role, is_active, approval_status,
                 approval_reviewed_at, approval_reviewed_by, approval_reason, created_at`,
      [req.params.id, approvalStatus, req.user.id, req.body.reason?.trim() || null]
    );
    const approved = approvalStatus === "approved";
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, link_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.params.id,
        approved ? "instructor_application_approved" : "instructor_application_rejected",
        approved ? "Instructor application approved" : "Instructor application not approved",
        approved
          ? "Your instructor application is approved. You can now sign in."
          : `Your instructor application was not approved.${req.body.reason?.trim() ? ` Reason: ${req.body.reason.trim()}` : " Contact an administrator for more information."}`,
        approved ? "/instructor-dashboard" : "/login",
      ]
    );

    await client.query("COMMIT");
    return res.json({
      success: true,
      user: result.rows[0],
      message: approved
        ? "Instructor application approved."
        : "Instructor application rejected.",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    return next(error);
  } finally {
    if (client) client.release();
  }
}

async function updateUser(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = $2, email = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, role, avatar_url, bio, is_active,
                 approval_status, created_at, updated_at`,
      [req.params.id, req.body.full_name, req.body.email]
    );
    if (!result.rowCount) return sendError(res, 404, "User not found.");

    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return sendError(res, 409, "That email address is already in use.");
    }
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  const isActive = req.body.is_active;
  if (typeof isActive !== "boolean") {
    return sendError(res, 400, "is_active must be true or false.");
  }
  if (String(req.params.id) === String(req.user.id) && !isActive) {
    return sendError(res, 409, "You cannot deactivate your own administrator account.");
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [741206]);
    const target = await client.query(
      `SELECT id, role, is_active
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id]
    );
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "User not found.");
    }

    if (target.rows[0].role === "admin" && !isActive && target.rows[0].is_active) {
      const count = await client.query(
        "SELECT COUNT(*)::int AS active_admins FROM users WHERE role = 'admin' AND is_active = TRUE"
      );
      if (count.rows[0].active_admins <= 1) {
        await client.query("ROLLBACK");
        return sendError(res, 409, "The last active administrator cannot be deactivated.");
      }
    }

    const result = await client.query(
      `UPDATE users
       SET is_active = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, role, avatar_url, bio, is_active,
                 approval_status, created_at, updated_at`,
      [req.params.id, isActive]
    );
    await client.query("COMMIT");
    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    next(error);
  } finally {
    if (client) client.release();
  }
}

async function deleteUser(req, res, next) {
  if (String(req.params.id) === String(req.user.id)) {
    return sendError(res, 409, "You cannot delete your own administrator account.");
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [741206]);
    const target = await client.query(
      `SELECT id, role, is_active
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id]
    );
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "User not found.");
    }
    if (target.rows[0].role === "admin" && target.rows[0].is_active) {
      const count = await client.query(
        "SELECT COUNT(*)::int AS active_admins FROM users WHERE role = 'admin' AND is_active = TRUE"
      );
      if (count.rows[0].active_admins <= 1) {
        await client.query("ROLLBACK");
        return sendError(res, 409, "The last active administrator cannot be deleted.");
      }
    }

    await client.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    return res.json({ success: true, message: "User deleted." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error.code === "23503") {
      return sendError(
        res,
        409,
        "This account is linked to course or learning records and cannot be deleted. Deactivate it instead."
      );
    }
    next(error);
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  createStudent,
  getRecentUsers,
  getManagedAccounts,
  getPendingStudents,
  getPendingInstructors,
  updateStudentApproval,
  updateInstructorApproval,
  updateUser,
  updateUserStatus,
  deleteUser,
};
