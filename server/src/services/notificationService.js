const crypto = require("node:crypto");
const { pool } = require("../config/db");

async function notifyAssignmentGraded({
  userId,
  assignmentTitle,
  courseId,
  submissionId,
  grade,
  feedback,
}) {
  const dedupeKey = `assignment_graded:${crypto
    .createHash("sha256")
    .update(`${submissionId}\0${grade}\0${feedback}`)
    .digest("hex")}`;

  try {
    await pool.query(
      `INSERT INTO notifications
         (user_id, type, title, message, link_url, dedupe_key)
       VALUES ($1, 'assignment_graded', 'Assignment graded', $2, $3, $4)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [
        userId,
        `Your submission for "${assignmentTitle}" has been graded.`,
        `/courses/${courseId}/assignments`,
        dedupeKey,
      ]
    );
  } catch (error) {
    console.error("Failed to create assignment grade notification:", error.message);
  }
}

module.exports = { notifyAssignmentGraded };
