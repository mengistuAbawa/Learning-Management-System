
const { pool } = require("../config/db");

const validId = (value) => /^[1-9]\d*$/.test(String(value));

function parsePagination(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(String(value))) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

async function listNotifications(req, res, next) {
  try {
    const limit = parsePagination(req.query.limit, 20, 100);
    const offset = parsePagination(req.query.offset, 0, 1000000000);

    if (limit === null || limit === 0) {
      return res.status(400).json({
        success: false,
        message: "Limit must be an integer between 1 and 100.",
      });
    }
    if (offset === null) {
      return res.status(400).json({
        success: false,
        message: "Offset must be a valid non-negative integer.",
      });
    }

    const [result, countResult] = await Promise.all([
      pool.query(
        `SELECT id, type, title, message, link_url, is_read, created_at, read_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count
         FROM notifications
         WHERE user_id = $1`,
        [req.user.id]
      ),
    ]);

    const { total, unread_count: unreadCount } = countResult.rows[0];

    return res.json({
      success: true,
      notifications: result.rows,
      unread_count: unreadCount,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + result.rows.length < total,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );

    return res.json({
      success: true,
      unread_count: result.rows[0].unread_count,
    });
  } catch (error) {
    return next(error);
  }
}

async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID.",
      });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND user_id = $2
       RETURNING id, type, title, message, link_url, is_read, created_at, read_at`,
      [id, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.json({
      success: true,
      notification: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );

    return res.json({
      success: true,
      updated_count: result.rowCount,
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID.",
      });
    }

    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.json({
      success: true,
      deleted_id: result.rows[0].id,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
