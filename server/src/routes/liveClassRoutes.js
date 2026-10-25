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
const validatePollId = [
  param("pollId").isInt({ min: 1 }).withMessage("Poll ID must be a positive integer."),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid poll ID.",
      });
    }
    next();
  },
];
const validateParticipantId = [
  param("participantId").isInt({ min: 1 }).withMessage("Participant ID must be a positive integer."),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid participant ID.",
      });
    }
    next();
  },
];
const classroomActionLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many classroom actions. Please wait before trying again.",
  },
});

router.use(authenticate);

router.get("/", controller.list);
router.get(
  "/attendance/mine",
  authorize("student"),
  controller.getMyAttendance
);
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
router.get(
  "/:id/permitted-participants",
  ...validateId,
  authorize("instructor", "admin"),
  controller.getPermittedParticipants
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
router.get("/:id/participants", ...validateId, controller.listParticipants);
router.post(
  "/:id/participants/:participantId/mute",
  ...validateId,
  ...validateParticipantId,
  classroomActionLimit,
  controller.muteParticipant
);
router.post(
  "/:id/participants/:participantId/remove",
  ...validateId,
  ...validateParticipantId,
  classroomActionLimit,
  controller.removeParticipant
);
router.post("/:id/chat", ...validateId, classroomActionLimit, controller.sendChat);
router.get("/:id/chat", ...validateId, controller.getChatHistory);
router.post("/:id/hand", ...validateId, classroomActionLimit, controller.raiseHand);
router.get("/:id/polls", ...validateId, controller.getPolls);
router.post("/:id/polls", ...validateId, classroomActionLimit, controller.createPoll);
router.post(
  "/:id/polls/:pollId/vote",
  ...validateId,
  ...validatePollId,
  classroomActionLimit,
  controller.votePoll
);
router.patch(
  "/:id/polls/:pollId",
  ...validateId,
  ...validatePollId,
  classroomActionLimit,
  controller.updatePoll
);
router.get("/:id/whiteboard", ...validateId, controller.getWhiteboard);
router.post(
  "/:id/whiteboard",
  ...validateId,
  classroomActionLimit,
  controller.createWhiteboardEvent
);
router.patch(
  "/:id/whiteboard/permissions",
  ...validateId,
  classroomActionLimit,
  controller.updateWhiteboardPermission
);
router.post(
  "/:id/attendance/join",
  ...validateId,
  classroomActionLimit,
  controller.joinAttendance
);
router.post(
  "/:id/attendance/leave",
  ...validateId,
  controller.leaveAttendance
);
router.get("/:id/attendance", ...validateId, controller.getAttendance);

module.exports = router;
