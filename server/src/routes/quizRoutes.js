const express = require("express");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/quizController");

const router = express.Router();

router.use(authenticate);

router.get("/courses/:courseId/quizzes", controller.listQuizzes);
router.post("/courses/:courseId/quizzes", controller.createQuiz);
router.get("/quizzes/:quizId", controller.getQuiz);
router.post("/quizzes/:quizId/questions", controller.addQuestion);

router.post("/quizzes/:quizId/attempts", controller.startAttempt);
router.post("/quiz-attempts/:attemptId/submit", controller.submitAttempt);
router.get("/quiz-attempts/mine", controller.getMyAttempts);

module.exports = router;