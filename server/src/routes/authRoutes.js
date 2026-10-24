
const express = require("express");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const authController = require("../controllers/authController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Try again later.",
  },
});

function handleValidation(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Please correct the submitted information.",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }

  next();
}

const validateEmail = body("email")
  .trim()
  .isEmail()
  .withMessage("Enter a valid email address.")
  .bail()
  .isLength({ max: 255 })
  .withMessage("Email must not exceed 255 characters.")
  .normalizeEmail();

router.post(
  "/register",
  authLimiter,
  body("full_name")
    .isString()
    .withMessage("Full name must be text.")
    .bail()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage("Full name must contain 2–150 characters.")
    .matches(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u)
    .withMessage("Full name contains unsupported characters."),
  validateEmail,
  body("password")
    .isString()
    .withMessage("Password must be text.")
    .bail()
    .isStrongPassword({
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    })
    .withMessage(
      "Password must have at least 8 characters, including uppercase, lowercase, a number, and a symbol."
    ),
  handleValidation,
  authController.register
);

router.post(
  "/instructors",
  authenticate,
  authorize("admin"),
  body("full_name")
    .isString()
    .withMessage("Full name must be text.")
    .bail()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage("Full name must contain 2–150 characters.")
    .matches(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u)
    .withMessage("Full name contains unsupported characters."),
  validateEmail,
  body("password")
    .isString()
    .withMessage("Password must be text.")
    .bail()
    .isStrongPassword({
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    })
    .withMessage(
      "Password must have at least 8 characters, including uppercase, lowercase, a number, and a symbol."
    ),
  handleValidation,
  authController.createInstructor
);

router.post(
  "/login",
  authLimiter,
  validateEmail,
  body("password")
    .isString()
    .withMessage("Password is required.")
    .bail()
    .notEmpty()
    .withMessage("Password is required.")
    .isLength({ max: 128 })
    .withMessage("Password is too long."),
  handleValidation,
  authController.login
);

router.get("/me", authenticate, authController.me);

module.exports = router;
