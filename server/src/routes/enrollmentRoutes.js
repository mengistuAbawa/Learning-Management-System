
const express = require("express");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/enrollmentController");

const router = express.Router();

router.use(authenticate);

router.post("/courses/:courseId", controller.enrollInCourse);
router.get("/my", controller.getMyEnrollments);
router.get("/courses/:courseId", controller.getCourseEnrollments);
router.patch("/:id/status", controller.updateEnrollmentStatus);

module.exports = router;
