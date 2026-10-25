const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/quizController");

const router = express.Router();

router.use(authenticate);
const attemptWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many assessment updates. Please wait before trying again.",
  },
});

router.get("/courses/:courseId/quizzes", controller.listQuizzes);
router.post("/courses/:courseId/quizzes", controller.createQuiz);
router.get("/quizzes/:quizId", controller.getQuiz);
router.post("/quizzes/:quizId/questions", controller.addQuestion);

router.post("/quizzes/:quizId/attempts", controller.startAttempt);
router.get("/quiz-attempts/mine", controller.getMyAttempts);
router.get("/quiz-attempts/:attemptId/result", controller.getAttemptResult);
router.get("/quiz-attempts/:attemptId", controller.getAttempt);
router.put(
  "/quiz-attempts/:attemptId/answers/:questionId",
  attemptWriteLimiter,
  controller.saveAnswer
);
router.put(
  "/quiz-attempts/:attemptId/questions/:questionId/flags",
  attemptWriteLimiter,
  controller.updateQuestionFlags
);
router.post(
  "/quiz-attempts/:attemptId/submit",
  attemptWriteLimiter,
  controller.submitAttempt
);
router.get("/instructor/quizzes/grading", controller.getPendingGrading);
router.put(
  "/instructor/quiz-attempts/:attemptId/grade",
  attemptWriteLimiter,
  controller.gradeAttempt
);

module.exports = router;