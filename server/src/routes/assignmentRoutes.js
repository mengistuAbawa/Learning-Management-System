const express = require("express");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/assignmentController");

const router = express.Router();

router.use(authenticate);

router.get(
  "/courses/:courseId/assignments",
  controller.listAssignments
);

router.post(
  "/courses/:courseId/assignments",
  controller.createAssignment
);

router.post(
  "/assignments/:assignmentId/submit",
  controller.submitAssignment
);

router.get(
  "/assignments/:assignmentId/submissions",
  controller.listSubmissions
);

router.patch(
  "/assignment-submissions/:submissionId/grade",
  controller.gradeSubmission
);

router.get("/assignment-submissions/mine", controller.getMySubmissions);

module.exports = router;