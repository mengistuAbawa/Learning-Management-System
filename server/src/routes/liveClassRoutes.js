const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { param, validationResult } = require("express-validator");
const { authenticate, authorize } = require("../middleware/auth");
const controller = require("../controllers/liveClassController");

const router = express.Router();
const validateId = [
  param("id").isInt({ min: 1 }).withMessage("Live class ID must be a positive integer."),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid live class ID.",
      });
    }
    next();
  },
];
const classroomActionLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many classroom actions. Please wait before trying again.",
  },
});

router.use(authenticate);

router.get("/", controller.list);
router.post(
  "/",
  authorize("instructor", "admin"),
  controller.create
);
router.get("/:id", ...validateId, controller.getById);
router.patch(
  "/:id",
  ...validateId,
  authorize("instructor", "admin"),
  controller.update
);
router.post(
  "/:id/start",
  ...validateId,
  authorize("instructor", "admin"),
  controller.start
);
router.post(
  "/:id/end",
  ...validateId,
  authorize("instructor", "admin"),
  controller.end
);
router.post(
  "/:id/cancel",
  ...validateId,
  authorize("instructor", "admin"),
  controller.cancel
);
router.post("/:id/token", ...validateId, controller.issueToken);
router.post("/:id/chat", ...validateId, classroomActionLimit, controller.sendChat);
router.post("/:id/hand", ...validateId, classroomActionLimit, controller.raiseHand);

module.exports = router;
