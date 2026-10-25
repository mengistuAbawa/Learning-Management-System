const crypto = require("node:crypto");
const fs = require("node:fs");
const multer = require("multer");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { param, validationResult } = require("express-validator");
const { authenticate, authorize } = require("../middleware/auth");
const controller = require("../controllers/courseVideoController");

fs.mkdirSync(controller.uploadDirectory, { recursive: true });

const router = express.Router();
const allowedTypes = new Set(Object.keys(controller.videoExtensions));
const allowedTypeAliases = new Set([
  "application/octet-stream",
  "video/x-matroska",
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: controller.uploadDirectory,
    filename: (req, file, callback) => {
      const extension =
        controller.videoExtensions[file.mimetype.split(";")[0].toLowerCase()];
      callback(null, `${crypto.randomUUID()}${extension || ".upload"}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const mediaType = file.mimetype.split(";")[0].toLowerCase();
    if (!allowedTypes.has(mediaType) && !allowedTypeAliases.has(mediaType)) {
      const error = new Error("Only WebM, MP4, and Ogg video recordings are supported.");
      error.code = "INVALID_VIDEO_TYPE";
      return callback(error);
    }
    return callback(null, true);
  },
});
const uploadLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many video uploads. Please try again later.",
  },
});
const validateId = [
  param("id").isInt({ min: 1 }).withMessage("Video ID must be a positive integer."),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: "Invalid video ID." });
    }
    next();
  },
];

router.get("/", authenticate, controller.list);
router.post(
  "/courses/:courseId",
  authenticate,
  authorize("instructor"),
  param("courseId").isInt({ min: 1 }),
  (req, res, next) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ success: false, message: "Invalid course ID." });
    }
    next();
  },
  uploadLimit,
  (req, res, next) => {
    upload.single("video")(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Video recordings must be 200 MB or smaller.",
        });
      }
      if (
        error instanceof multer.MulterError ||
        error.code === "INVALID_VIDEO_TYPE"
      ) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return next(error);
    });
  },
  controller.create
);
router.post("/:id/playback", authenticate, ...validateId, controller.createPlaybackLink);
router.patch(
  "/:id/publish",
  authenticate,
  authorize("instructor"),
  ...validateId,
  controller.publish
);
router.put(
  "/:id",
  authenticate,
  authorize("instructor"),
  ...validateId,
  controller.update
);
router.delete(
  "/:id",
  authenticate,
  authorize("instructor"),
  ...validateId,
  controller.remove
);
router.get("/:id/stream", ...validateId, controller.stream);

module.exports = router;
