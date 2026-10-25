const { pool } = require("../config/db");
const { version: applicationVersion } = require("../../package.json");

const ALLOWED_SETTINGS = new Set([
  "platform_name",
  "public_registration_enabled",
  "support_email",
  "platform_language",
  "platform_timezone",
]);
const ANNOUNCEMENT_AUDIENCES = new Set(["all", "student", "instructor"]);
const ANNOUNCEMENT_STATUSES = new Set(["draft", "published", "archived"]);

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function parseLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
}

async function notifyAnnouncement(client, announcement) {
  const result = await client.query(
    `INSERT INTO notifications
       (user_id, title, message, type, link_url, announcement_id)
     SELECT id, $1::varchar, $2::text, 'announcement', '/notifications', $3::bigint
     FROM users
     WHERE is_active = TRUE
       AND approval_status = 'approved'
       AND ($4::text = 'all' OR role = $4::text)
     ON CONFLICT (announcement_id, user_id)
       WHERE announcement_id IS NOT NULL
     DO NOTHING`,
    [
      announcement.title,
      announcement.message,
      announcement.id,
      announcement.audience,
    ],
  );
  return result.rowCount;
}

async function getAnnouncements(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, title, message, audience, status, created_by, published_at,
              created_at, updated_at
       FROM announcements
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [parseLimit(req.query.limit)]
    );
    return res.json({ success: true, announcements: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function createAnnouncement(req, res, next) {
  const { title, message } = req.body;
  const audience = req.body.audience || "all";
  const status = req.body.status || "draft";

  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 200) {
    return sendError(res, 400, "Title must contain 1–200 characters.");
  }
  if (typeof message !== "string" || message.trim().length < 1 || message.trim().length > 10000) {
    return sendError(res, 400, "Message must contain 1–10,000 characters.");
  }
  if (!ANNOUNCEMENT_AUDIENCES.has(audience)) {
    return sendError(res, 400, "Audience must be all, student, or instructor.");
  }
  if (!ANNOUNCEMENT_STATUSES.has(status)) {
    return sendError(res, 400, "Status must be draft, published, or archived.");
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO announcements
         (title, message, audience, status, created_by, published_at)
       VALUES ($1, $2, $3, $4, $5,
               CASE WHEN $6 THEN NOW() ELSE NULL END)
       RETURNING id, title, message, audience, status, created_by,
                 published_at, created_at, updated_at`,
      [title.trim(), message.trim(), audience, status, req.user.id, status === "published"]
    );
    const notified = status === "published"
      ? await notifyAnnouncement(client, result.rows[0])
      : 0;
    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      announcement: result.rows[0],
      notifications_created: notified,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    return next(error);
  } finally {
    if (client) client.release();
  }
}

async function updateAnnouncement(req, res, next) {
  const fields = [];
  const values = [];
  const body = req.body;

  if (Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 200) {
      return sendError(res, 400, "Title must contain 1–200 characters.");
    }
    values.push(body.title.trim());
    fields.push(`title = $${values.length}`);
  }
  if (Object.hasOwn(body, "message")) {
    if (typeof body.message !== "string" || body.message.trim().length < 1 || body.message.trim().length > 10000) {
      return sendError(res, 400, "Message must contain 1–10,000 characters.");
    }
    values.push(body.message.trim());
    fields.push(`message = $${values.length}`);
  }
  if (Object.hasOwn(body, "audience")) {
    if (!ANNOUNCEMENT_AUDIENCES.has(body.audience)) {
      return sendError(res, 400, "Audience must be all, student, or instructor.");
    }
    values.push(body.audience);
    fields.push(`audience = $${values.length}`);
  }
  if (Object.hasOwn(body, "status")) {
    if (!ANNOUNCEMENT_STATUSES.has(body.status)) {
      return sendError(res, 400, "Status must be draft, published, or archived.");
    }
    values.push(body.status);
    fields.push(`status = $${values.length}`);
    fields.push(
      body.status === "published"
        ? "published_at = CASE WHEN status = 'published' THEN published_at ELSE NOW() END"
        : "published_at = NULL",
    );
  }
  if (fields.length === 0) {
    return sendError(res, 400, "Provide at least one announcement field to update.");
  }

  fields.push("updated_at = NOW()");
  values.push(req.params.id);

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const previous = await client.query(
      `SELECT id, status FROM announcements WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!previous.rowCount) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Announcement not found.");
    }
    const result = await client.query(
      `UPDATE announcements
       SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING id, title, message, audience, status, created_by,
                 published_at, created_at, updated_at`,
      values
    );
    const publishedNow =
      previous.rows[0].status !== "published" &&
      result.rows[0].status === "published";
    const notified = publishedNow
      ? await notifyAnnouncement(client, result.rows[0])
      : 0;
    await client.query("COMMIT");
    return res.json({
      success: true,
      announcement: result.rows[0],
      notifications_created: notified,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    return next(error);
  } finally {
    if (client) client.release();
  }
}

async function deleteAnnouncement(req, res, next) {
  try {
    const existing = await pool.query(
      "SELECT status FROM announcements WHERE id = $1",
      [req.params.id],
    );
    if (!existing.rowCount) return sendError(res, 404, "Announcement not found.");
    if (existing.rows[0].status === "published") {
      return sendError(res, 409, "Unpublish or archive this announcement before deleting it.");
    }
    const result = await pool.query(
      "DELETE FROM announcements WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!result.rowCount) return sendError(res, 404, "Announcement not found.");
    return res.json({ success: true, message: "Announcement deleted." });
  } catch (error) {
    return next(error);
  }
}

async function listPublishedAnnouncements(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, title, message, audience, published_at
       FROM announcements
       WHERE status = 'published'
         AND (audience = 'all' OR audience = $1)
       ORDER BY published_at DESC NULLS LAST, id DESC
       LIMIT $2`,
      [req.user.role, parseLimit(req.query.limit)]
    );
    return res.json({ success: true, announcements: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function getSettings(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value, updated_by, updated_at
       FROM platform_settings
       ORDER BY setting_key`
    );
    return res.json({
      success: true,
      settings: result.rows.reduce((settings, row) => {
        settings[row.setting_key] = {
          value: row.setting_value,
          updated_by: row.updated_by,
          updated_at: row.updated_at,
        };
        return settings;
      }, {}),
    });
  } catch (error) {
    return next(error);
  }
}

async function updateSetting(req, res, next) {
  const { key } = req.params;
  const { value } = req.body;
  if (!ALLOWED_SETTINGS.has(key)) {
    return sendError(res, 400, "This platform setting is not supported.");
  }
  if (value === undefined || Buffer.byteLength(JSON.stringify(value), "utf8") > 4000) {
    return sendError(res, 400, "A setting value of at most 4 KB is required.");
  }
  if (
    (key === "platform_name" &&
      (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 100)) ||
    (key === "public_registration_enabled" && typeof value !== "boolean") ||
    (key === "platform_language" &&
      !["en", "am", "es", "fr"].includes(value)) ||
    (key === "platform_timezone" &&
      (typeof value !== "string" ||
        value.length > 100 ||
        !isValidTimeZone(value))) ||
    (key === "support_email" &&
      value !== null &&
      (typeof value !== "string" || value.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
  ) {
    return sendError(res, 400, "The value is invalid for this platform setting.");
  }

  try {
    const result = await pool.query(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
       RETURNING setting_key, setting_value, updated_by, updated_at`,
      [key, JSON.stringify(key === "platform_name" ? value.trim() : value), req.user.id]
    );
    return res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

async function getAuditLogs(req, res, next) {
  const rawPage = req.query.page === undefined ? "1" : String(req.query.page);
  const rawLimit = req.query.limit === undefined ? "50" : String(req.query.limit);
  if (!/^[1-9]\d*$/.test(rawPage) || !/^[1-9]\d*$/.test(rawLimit)) {
    return sendError(res, 400, "page and limit must be positive integers.");
  }
  const page = Number(rawPage);
  const limit = Math.min(Number(rawLimit), 100);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit)) {
    return sendError(res, 400, "page or limit is outside the supported range.");
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    return sendError(res, 400, "page is outside the supported range.");
  }
  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim().slice(0, 100)
      : "";
  const from = req.query.from;
  const to = req.query.to;
  for (const date of [from, to]) {
    if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
      return sendError(res, 400, "from and to must be valid ISO dates.");
    }
  }
  if (from && to && from > to) {
    return sendError(res, 400, "from must be on or before to.");
  }

  const conditions = [];
  const values = [];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(logs.action ILIKE $${values.length}
        OR logs.resource ILIKE $${values.length}
        OR COALESCE(logs.resource_id, '') ILIKE $${values.length}
        OR COALESCE(users.full_name, '') ILIKE $${values.length}
        OR COALESCE(users.email, '') ILIKE $${values.length})`,
    );
  }
  if (from) {
    values.push(from);
    conditions.push(`logs.created_at >= $${values.length}::date`);
  }
  if (to) {
    values.push(to);
    conditions.push(`logs.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  try {
    const [result, count] = await Promise.all([
      pool.query(
      `SELECT logs.id, logs.actor_user_id, users.full_name AS actor_name,
              users.email AS actor_email, logs.action, logs.resource,
              logs.resource_id, logs.http_method, logs.response_status,
              logs.created_at
       FROM admin_audit_logs AS logs
       LEFT JOIN users ON users.id = logs.actor_user_id
       ${where}
       ORDER BY logs.created_at DESC, logs.id DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      [...values, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM admin_audit_logs AS logs
         LEFT JOIN users ON users.id = logs.actor_user_id
         ${where}`,
        values,
      ),
    ]);
    const total = count.rows[0].total;
    return res.json({
      success: true,
      logs: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        has_more: page * limit < total,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getSystemHealth(req, res, next) {
  const startedAt = Date.now();
  try {
    const result = await pool.query(
      `SELECT current_database() AS database,
              NOW() AS database_time,
              (SELECT COUNT(*)::int FROM pg_stat_activity
               WHERE datname = current_database()) AS database_connections`
    );
    const database = result.rows[0];
    return res.json({
      success: true,
      status: "healthy",
      checks: {
        api: {
          status: "healthy",
          version: applicationVersion,
          uptime_seconds: Math.floor(process.uptime()),
        },
        database: {
          status: "healthy",
          name: database.database,
          checked_at: database.database_time,
          connections: database.database_connections,
          response_time_ms: Date.now() - startedAt,
        },
        memory: {
          rss_bytes: process.memoryUsage().rss,
          heap_used_bytes: process.memoryUsage().heapUsed,
        },
      },
    });
  } catch (error) {
    if (error.code) {
      console.error("Administrator system-health database check failed:", error.message);
      return res.status(503).json({
        success: false,
        status: "degraded",
        checks: {
          api: {
            status: "healthy",
            version: applicationVersion,
            uptime_seconds: Math.floor(process.uptime()),
          },
          database: { status: "unavailable" },
        },
      });
    }
    return next(error);
  }
}

module.exports = {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listPublishedAnnouncements,
  getSettings,
  updateSetting,
  getAuditLogs,
  getSystemHealth,
};
