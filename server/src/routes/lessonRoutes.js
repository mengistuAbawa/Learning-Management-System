const express = require("express");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/lessonController");

const router = express.Router();

router.use(authenticate);

router.get("/modules/:moduleId/lessons", controller.listLessons);
router.post("/modules/:moduleId/lessons", controller.createLesson);
router.post("/modules/:moduleId/lessons/reorder", controller.reorderLessons);

router.get("/lessons/:id", controller.getLessonById);
router.patch("/lessons/:id", controller.updateLesson);
router.delete("/lessons/:id", controller.deleteLesson);

module.exports = router;