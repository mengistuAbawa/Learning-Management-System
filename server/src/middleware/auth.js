
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or too short.");
  }

  return secret;
}

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is missing.",
    });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      issuer: "learnsphere-lms",
      audience: "learnsphere-lms-client",
      algorithms: ["HS256"],
    });

    if (
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    const result = await pool.query(
      `SELECT id, full_name, email, role, avatar_url,
              bio, is_active, approval_status, created_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: "Account is unavailable. Please log in again.",
      });
    }

    if (user.role === "student" && user.approval_status !== "approved") {
      return res.status(403).json({
        success: false,
        message:
          user.approval_status === "rejected"
            ? "Your student registration was not approved. Contact an administrator."
            : "Your student registration is awaiting administrator approval.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    console.error("Authentication error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to authenticate the request.",
    });
  }
}

function authorize(...allowedRoles) {
  const validRoles = ["student", "instructor", "admin"];

  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !validRoles.includes(role))
  ) {
    throw new Error("authorize() received an invalid role configuration.");
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  authorize,
};
