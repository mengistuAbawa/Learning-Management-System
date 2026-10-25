const express = require("express");
const { param, validationResult } = require("express-validator");
const { authenticate, authorize } = require("../middleware/auth");
const { auditAdminAction } = require("../middleware/adminAudit");
const controller = require("../controllers/adminPlatformController");

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Please correct the submitted information.",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }
  return next();
}

router.use(authenticate);
router.get("/announcements/published", controller.listPublishedAnnouncements);
router.use(authorize("admin"), auditAdminAction);

router.get("/health", controller.getSystemHealth);
router.get("/announcements", controller.getAnnouncements);
router.post("/announcements", controller.createAnnouncement);
router.patch(
  "/announcements/:id",
  param("id").isInt({ min: 1 }).withMessage("Announcement ID must be a positive integer."),
  validateRequest,
  controller.updateAnnouncement
);
router.delete(
  "/announcements/:id",
  param("id").isInt({ min: 1 }).withMessage("Announcement ID must be a positive integer."),
  validateRequest,
  controller.deleteAnnouncement
);
router.get("/settings", controller.getSettings);
router.put(
  "/settings/:key",
  param("key").isString().isLength({ min: 1, max: 80 }),
  validateRequest,
  controller.updateSetting
);
router.get("/audit-logs", controller.getAuditLogs);

module.exports = router;
