const { pool } = require("../config/db");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function auditAdminAction(req, res, next) {
  if (req.user?.role !== "admin" || !MUTATING_METHODS.has(req.method)) {
    return next();
  }

  res.once("finish", () => {
    const segments = req.path.split("/").filter(Boolean);
    const resource = segments[0] || "admin";
    const resourceId = segments.length > 1 ? segments[1] : null;
    const action = `${req.method} ${req.baseUrl}${req.path}`.slice(0, 120);
    pool
      .query(
        `INSERT INTO admin_audit_logs
           (actor_user_id, action, resource, resource_id, http_method, response_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          action,
          resource.slice(0, 120),
          resourceId?.slice(0, 120) || null,
          req.method,
          res.statusCode,
        ]
      )
      .catch((error) => {
        console.error("Failed to persist administrator audit log:", error.message);
      });
  });

  return next();
}

module.exports = { auditAdminAction };
