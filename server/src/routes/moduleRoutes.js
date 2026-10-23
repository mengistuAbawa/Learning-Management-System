const express = require("express");
const { authenticate } = require("../middleware/auth");
const controller = require("../middleware/moduleController");

const router = express.Router();

router.use(authenticate);

router.get("/courses/:courseId/modules", controller.listModules);
router.post("/courses/:courseId/modules", controller.createModule);
router.post("/courses/:courseId/modules/reorder", controller.reorderModules);
router.patch("/modules/:id", controller.updateModule);
router.delete("/modules/:id", controller.deleteModule);

module.exports = router;