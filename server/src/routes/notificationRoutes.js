const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const notificationController = require(
  "../controllers/notificationController"
);

router.use(authenticate);

router.get("/", notificationController.listNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;
