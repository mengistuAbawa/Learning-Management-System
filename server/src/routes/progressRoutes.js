
const express = require("express");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/progressController");

const router = express.Router();

router.use(authenticate);

router.get(
  "/courses/:courseId",
  controller.getCourseProgress
);

router.get(
  "/courses/:courseId/lessons",
  controller.getCourseLessonProgress
);

router.patch(
  "/lessons/:lessonId",
  controller.updateLessonProgress
);

module.exports = router;
