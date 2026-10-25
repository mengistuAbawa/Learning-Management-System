
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const SALT_ROUNDS = 12;

async function publicRegistrationEnabled() {
  const result = await pool.query(
    `SELECT setting_value
     FROM platform_settings
     WHERE setting_key = 'public_registration_enabled'`
  );
  return !result.rowCount || result.rows[0].setting_value !== false;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 characters."
    );
  }

  return secret;
}

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
    bio: user.bio,
    is_active: user.is_active,
    approval_status: user.approval_status,
    created_at: user.created_at,
  };
}

function createToken(user) {
  return jwt.sign(
    { sub: String(user.id) },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      issuer: "learnsphere-lms",
      audience: "learnsphere-lms-client",
    }
  );
}

async function register(req, res) {
  try {
    if (!(await publicRegistrationEnabled())) {
      return res.status(403).json({
        success: false,
        message: "Public student registration is currently closed.",
      });
    }

    const fullName = req.body.full_name.trim();
    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    // Public registration always creates a student.
    // Never accept a role from the request body.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users
         (full_name, email, password_hash, role, approval_status)
       VALUES ($1, $2, $3, 'student', 'pending')
       RETURNING id, full_name, email, role, avatar_url,
                 bio, is_active, approval_status, created_at`,
      [fullName, email, passwordHash]
    );

    const user = result.rows[0];

    return res.status(201).json({
      success: true,
      message: "Registration submitted. You can sign in after an administrator approves your account.",
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to complete registration.",
    });
  }
}

async function applyAsInstructor(req, res) {
  try {
    if (!(await publicRegistrationEnabled())) {
      return res.status(403).json({
        success: false,
        message: "Public registration is currently closed.",
      });
    }

    const fullName = req.body.full_name.trim();
    const email = req.body.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users
         (full_name, email, password_hash, role, approval_status)
       VALUES ($1, $2, $3, 'instructor', 'pending')
       RETURNING id, full_name, email, role, avatar_url,
                 bio, is_active, approval_status, created_at`,
      [fullName, email, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: "Instructor application submitted for administrator review.",
      user: publicUser(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }
    console.error("Instructor application error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to submit the instructor application.",
    });
  }
}

async function createInstructor(req, res) {
  try {
    const fullName = req.body.full_name.trim();
    const email = req.body.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'instructor')
       RETURNING id, full_name, email, role, avatar_url,
                 bio, is_active, approval_status, created_at`,
      [fullName, email, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: "Instructor account created successfully.",
      user: publicUser(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Instructor account creation error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create the instructor account.",
    });
  }
}

async function login(req, res) {
  try {
    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role,
              avatar_url, bio, is_active, approval_status, created_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];

    // Use a generic message to avoid revealing whether an email exists.
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive. Contact an administrator.",
      });
    }

    if (
      ["student", "instructor"].includes(user.role) &&
      user.approval_status !== "approved"
    ) {
      return res.status(403).json({
        success: false,
        message:
          user.approval_status === "rejected"
            ? `Your ${user.role} application was not approved. Contact an administrator.`
            : `Your ${user.role} application is awaiting administrator approval.`,
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to complete login.",
    });
  }
}

async function me(req, res) {
  return res.status(200).json({
    success: true,
    user: publicUser(req.user),
  });
}

module.exports = {
  register,
  applyAsInstructor,
  createInstructor,
  login,
  me,
};
