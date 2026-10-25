const express = require("express");
const { body, param, validationResult } = require("express-validator");
const { authenticate, authorize } = require("../middleware/auth");
const controller = require("../controllers/adminUserController");

const router = express.Router();

function validateRequest(req, res, next) {
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
  return next();
}

const validateId = param("id")
  .isInt({ min: 1 })
  .withMessage("User ID must be a positive integer.");

router.use(authenticate, authorize("admin"));
router.post(
  "/students",
  body("full_name")
    .isString()
    .withMessage("Full name must be text.")
    .bail()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage("Full name must contain 2–150 characters.")
    .matches(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u)
    .withMessage("Full name contains unsupported characters."),
  body("email")
    .isString()
    .withMessage("Email must be text.")
    .bail()
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters.")
    .normalizeEmail(),
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
  validateRequest,
  controller.createStudent
);
router.get("/students/pending", controller.getPendingStudents);
router.patch(
  "/students/:id/approval",
  validateId,
  body("approval_status")
    .isIn(["approved", "rejected"])
    .withMessage("approval_status must be approved or rejected."),
  validateRequest,
  controller.updateStudentApproval
);
router.get("/recent", controller.getRecentUsers);
router.patch(
  "/:id",
  validateId,
  body("full_name")
    .isString()
    .withMessage("Full name must be text.")
    .bail()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage("Full name must contain 2–150 characters.")
    .matches(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u)
    .withMessage("Full name contains unsupported characters."),
  body("email")
    .isString()
    .withMessage("Email must be text.")
    .bail()
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters.")
    .normalizeEmail(),
  validateRequest,
  controller.updateUser
);
router.patch(
  "/:id/status",
  validateId,
  body("is_active")
    .isBoolean()
    .withMessage("is_active must be true or false.")
    .toBoolean(),
  validateRequest,
  controller.updateUserStatus
);
router.delete("/:id", validateId, validateRequest, controller.deleteUser);

module.exports = router;
