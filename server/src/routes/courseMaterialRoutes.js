const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { param, validationResult } = require("express-validator");
const { authenticate, authorize } = require("../middleware/auth");
const controller = require("../controllers/courseMaterialController");

fs.mkdirSync(controller.materialDirectory, { recursive: true });

const router = express.Router();
const allowedExtensions = new Set(Object.keys(controller.materialTypes));
const upload = multer({
  storage: multer.diskStorage({
    destination: controller.materialDirectory,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      const error = new Error("Choose a PDF, DOC, DOCX, PPT, or PPTX file.");
      error.code = "INVALID_MATERIAL_TYPE";
      return callback(error);
    }
    return callback(null, true);
  },
});
const uploadLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many document uploads. Please try again later.",
  },
});
const validateParam = (name, label) => [
  param(name).isInt({ min: 1 }),
  (req, res, next) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ success: false, message: `Invalid ${label}.` });
    }
    next();
  },
];

router.get(
  "/lessons/:lessonId",
  authenticate,
  ...validateParam("lessonId", "lesson ID"),
  controller.listForLesson
);
router.get(
  "/courses/:courseId",
  authenticate,
  authorize("instructor", "admin"),
  ...validateParam("courseId", "course ID"),
  controller.listForCourse
);
router.post(
  "/courses/:courseId",
  authenticate,
  authorize("instructor"),
  ...validateParam("courseId", "course ID"),
  uploadLimit,
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Documents must be 50 MB or smaller.",
        });
      }
      if (
        error instanceof multer.MulterError ||
        error.code === "INVALID_MATERIAL_TYPE"
      ) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return next(error);
    });
  },
  controller.create
);
router.patch(
  "/:id/publish",
  authenticate,
  authorize("instructor", "admin"),
  ...validateParam("id", "material ID"),
  controller.publish
);
router.delete(
  "/:id",
  authenticate,
  authorize("instructor", "admin"),
  ...validateParam("id", "material ID"),
  controller.remove
);
router.get(
  "/:id/download",
  authenticate,
  ...validateParam("id", "material ID"),
  controller.download
);

module.exports = router;
