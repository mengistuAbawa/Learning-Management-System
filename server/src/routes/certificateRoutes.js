/**
 * Certificate Routes
 * Defines all endpoints for certificate issuance, retrieval, and verification.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { authenticate, authorize } = require("../middleware/auth");
const certificateController = require("../controllers/certificateController");

// Rate limiter for certificate verification endpoint (brute-force protection)
// 10 requests per 15 minutes per IP address
const certificateVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 requests per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message:
    "Too many certificate verification attempts. Please try again later.",
  skip: (req) => false, // Do not skip - always apply rate limit
});

// ============================================================================
// PROTECTED ROUTES (Authenticated & Authorized)
// ============================================================================

// Apply authentication to all routes except the public verification endpoint
router.use(authenticate);

/**
 * GET /api/certificates/my
 * List all certificates for the authenticated student.
 */
router.get("/my", certificateController.getMyCertificates);

/**
 * GET /api/certificates/:certificateId
 * Get certificate details by ID.
 */
router.get("/:certificateId", certificateController.getCertificate);

/**
 * GET /api/certificates/eligibility/:courseId
 * Check if eligible for a certificate in a course.
 * Route must be defined before :certificateId to avoid ambiguity.
 */
router.get("/eligibility/:courseId", certificateController.checkEligibility);

/**
 * POST /api/certificates/issue/:courseId
 * Issue or retrieve a certificate for a course.
 */
router.post("/issue/:courseId", certificateController.issueCertificate);

/**
 * GET /api/certificates/course/:courseId/completion
 * Get completion status including certificate info.
 * Route must be defined before generic :certificateId.
 */
router.get(
  "/course/:courseId/completion",
  certificateController.getCourseCompletionStatus,
);

// ============================================================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================================================

/**
 * GET /api/certificates/verify/:code
 * Public certificate verification endpoint.
 * Must be defined after other routes to avoid route collision.
 * Does not use authentication middleware.
 * Rate limited to prevent brute-force attacks on certificate codes.
 */
router.get(
  "/verify/:code",
  certificateVerificationLimiter,
  certificateController.verifyCertificate,
);

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = router;
