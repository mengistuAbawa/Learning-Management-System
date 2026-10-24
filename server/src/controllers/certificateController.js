/**
 * Certificate Controller
 * Handles HTTP endpoints for certificate issuance, retrieval, and verification.
 */

const certificateService = require("../services/certificateService");

// ============================================================================
// VALIDATION & UTILITIES
// ============================================================================

const validId = (value) =>
  typeof value === "string" || typeof value === "number"
    ? /^\d+$/.test(String(value)) && Number(value) > 0
    : false;

function errorResponse(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

function successResponse(res, status, message, data) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /api/certificates/my
 * List all certificates for the authenticated student.
 * Protected: Student access only.
 */
async function getMyCertificates(req, res, next) {
  try {
    if (req.user?.role !== "student") {
      return errorResponse(res, 403, "Only students can view their certificates.");
    }

    const certificates = await certificateService.getStudentCertificates(
      req.user.id
    );

    return successResponse(res, 200, "Certificates retrieved.", {
      certificates,
      count: certificates.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/certificates/:certificateId
 * Get details for a specific certificate.
 * Protected: Only the student who earned it can view it.
 */
async function getCertificate(req, res, next) {
  const { certificateId } = req.params;

  try {
    if (!validId(certificateId)) {
      return errorResponse(res, 400, "Invalid certificate ID.");
    }

    if (req.user?.role !== "student") {
      return errorResponse(res, 403, "Only students can view certificates.");
    }

    const certificate = await certificateService.getCertificateDetails(
      certificateId,
      req.user.id
    );

    if (!certificate) {
      return errorResponse(res, 404, "Certificate not found.");
    }

    return successResponse(res, 200, "Certificate retrieved.", certificate);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/certificates/eligibility/:courseId
 * Check if the authenticated student is eligible for a certificate in a course.
 * Protected: Student access only.
 */
async function checkEligibility(req, res, next) {
  const { courseId } = req.params;

  try {
    if (!validId(courseId)) {
      return errorResponse(res, 400, "Invalid course ID.");
    }

    if (req.user?.role !== "student") {
      return errorResponse(res, 403, "Only students can check certificate eligibility.");
    }

    const eligibility = await certificateService.checkEligibility(
      req.user.id,
      courseId
    );

    return successResponse(res, 200, "Eligibility checked.", eligibility);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/certificates/issue/:courseId
 * Issue a certificate for the authenticated student if eligible.
 * Idempotent: Returns existing certificate if already issued.
 * Protected: Student access only.
 */
async function issueCertificate(req, res, next) {
  const { courseId } = req.params;

  try {
    if (!validId(courseId)) {
      return errorResponse(res, 400, "Invalid course ID.");
    }

    if (req.user?.role !== "student") {
      return errorResponse(res, 403, "Only students can issue certificates.");
    }

    // Check eligibility first
    const eligibility = await certificateService.checkEligibility(
      req.user.id,
      courseId
    );

    if (!eligibility.eligible) {
      return errorResponse(
        res,
        403,
        eligibility.reason ||
          "You are not eligible for a certificate in this course."
      );
    }

    // Issue certificate (idempotent)
    const { certificate, isNew } = await certificateService.issueCertificate(
      req.user.id,
      courseId
    );

    const statusCode = isNew ? 201 : 200;
    const message = isNew
      ? "Certificate issued successfully."
      : "Certificate already issued.";

    return successResponse(res, statusCode, message, {
      certificate,
      isNew,
    });
  } catch (error) {
    // Handle eligibility errors (e.g., not eligible)
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
}

/**
 * GET /api/certificates/verify/:code
 * Public endpoint: Verify a certificate by its code.
 * No authentication required.
 */
async function verifyCertificate(req, res, next) {
  const { code } = req.params;

  try {
    // Validate code format (basic check)
    if (!code || typeof code !== "string" || code.length > 50) {
      return successResponse(res, 200, "Certificate verification result.", {
        valid: false,
        certificate: null,
      });
    }

    const result = await certificateService.verifyCertificateCode(code);

    return successResponse(res, 200, "Certificate verification result.", result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/certificates/course/:courseId/completion
 * Get completion status for a course (eligibility + certificate status).
 * Protected: Student access only.
 */
async function getCourseCompletionStatus(req, res, next) {
  const { courseId } = req.params;

  try {
    if (!validId(courseId)) {
      return errorResponse(res, 400, "Invalid course ID.");
    }

    if (req.user?.role !== "student") {
      return errorResponse(res, 403, "Only students can check completion status.");
    }

    const status = await certificateService.getCompletionStatus(
      req.user.id,
      courseId
    );

    return successResponse(
      res,
      200,
      "Course completion status retrieved.",
      status
    );
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getMyCertificates,
  getCertificate,
  checkEligibility,
  issueCertificate,
  verifyCertificate,
  getCourseCompletionStatus,
};
