
const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const { auditAdminAction } = require("../middleware/adminAudit");
const controller = require("../controllers/enrollmentController");

const router = express.Router();

router.use(authenticate);

router.post("/courses/:courseId", controller.enrollInCourse);
router.post(
  "/courses/:courseId/students",
  authorize("admin"),
  auditAdminAction,
  controller.enrollStudentAsAdmin
);
router.get("/my", controller.getMyEnrollments);
router.get("/courses/:courseId", controller.getCourseEnrollments);
router.patch("/:id/status", controller.updateEnrollmentStatus);

module.exports = router;
