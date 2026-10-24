/**
 * Certificate API Service
 * Handles all certificate-related API calls using the configured Axios instance.
 */

import api from "./api";

/**
 * Get all certificates for the authenticated student.
 * @returns {Promise<Array>}
 */
export async function getMyCertificates() {
  const response = await api.get("/certificates/my");
  return response.data.data.certificates;
}

/**
 * Get details for a specific certificate.
 * @param {number|string} certificateId - Certificate ID
 * @returns {Promise<Object>}
 */
export async function getCertificateDetails(certificateId) {
  const response = await api.get(`/certificates/${certificateId}`);
  return response.data.data;
}

/**
 * Check if student is eligible for a certificate in a course.
 * @param {number|string} courseId - Course ID
 * @returns {Promise<{eligible: boolean, enrollment?: Object, reason?: string}>}
 */
export async function checkCertificateEligibility(courseId) {
  const response = await api.get(`/certificates/eligibility/${courseId}`);
  return response.data.data;
}

/**
 * Issue a certificate for the authenticated student.
 * Idempotent: returns existing certificate if already issued.
 * @param {number|string} courseId - Course ID
 * @returns {Promise<{certificate: Object, isNew: boolean}>}
 */
export async function issueCertificate(courseId) {
  const response = await api.post(`/certificates/issue/${courseId}`);
  return response.data.data;
}

/**
 * Get course completion status including certificate status.
 * @param {number|string} courseId - Course ID
 * @returns {Promise<Object>}
 */
export async function getCourseCompletionStatus(courseId) {
  const response = await api.get(`/certificates/course/${courseId}/completion`);
  return response.data.data;
}

/**
 * Verify a certificate by its public code.
 * No authentication required.
 * @param {string} code - Certificate verification code (UUID)
 * @returns {Promise<{valid: boolean, certificate?: Object}>}
 */
export async function verifyCertificate(code) {
  const response = await api.get(`/certificates/verify/${code}`);
  return response.data.data;
}
