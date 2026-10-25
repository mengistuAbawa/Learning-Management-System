const express = require("express");
const { param, validationResult } = require("express-validator");

const { authenticate, authorize } = require("../middleware/auth");
const courseController = require("../controllers/courseController");

const router = express.Router();

function handleValidation(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Invalid request parameters.",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }

  next();
}

const validateCourseId = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Course ID must be a positive integer."),
  handleValidation,
];

router.use(authenticate);

// All authenticated users can view categories.
router.get("/categories", courseController.getCategories);
router.post(
  "/categories",
  authorize("admin"),
  courseController.createCategory,
);

// All authenticated roles can browse, but the controller restricts
// students to published courses and instructors to their own courses.
router.get("/", courseController.listCourses);
router.get("/:id", validateCourseId, courseController.getCourseById);

router.post(
  "/",
  authorize("instructor", "admin"),
  courseController.createCourse,
);

router.patch(
  "/:id",
  authorize("instructor", "admin"),
  validateCourseId,
  courseController.updateCourse,
);

router.delete(
  "/:id",
  authorize("instructor", "admin"),
  validateCourseId,
  courseController.deleteCourse,
);

module.exports = router;
