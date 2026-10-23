const { pool } = require("../config/db");
const { getCourse, ownsCourse, isEnrolled } = require("../services/courseAccess");
const { notifyAssignmentGraded } = require("../services/notificationService");

const validId = (value) => /^[1-9]\d*$/.test(String(value));

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function getAssignmentAccess(user, assignmentId) {
  const result = await pool.query(
    `SELECT a.*, c.instructor_id
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.id = $1`,
    [assignmentId]
  );

  const assignment = result.rows[0];

  if (!assignment) return { assignment: null, allowed: false };

  return {
    assignment,
    allowed: ownsCourse(user, {
      instructor_id: assignment.instructor_id,
    }),
  };
}

async function listAssignments(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!validId(courseId)) return fail(res, 400, "Invalid course ID.");

    const course = await getCourse(courseId);
    if (!course) return fail(res, 404, "Course not found.");

    const manager = ownsCourse(req.user, course);
    const enrolled = req.user.role === "student"
      ? await isEnrolled(req.user.id, courseId)
      : false;

    if (!manager && !enrolled) {
      return fail(res, 403, "Enroll in this course to view assignments.");
    }

    const result = await pool.query(
      `SELECT a.id, a.course_id, a.title, a.description, a.due_at,
              a.max_points, a.is_published, a.created_at,
              s.id AS submission_id, s.submitted_at,
              s.grade, s.feedback, s.status AS submission_status
       FROM assignments a
       LEFT JOIN assignment_submissions s
         ON s.assignment_id = a.id
        AND s.student_id = $2
       WHERE a.course_id = $1
         AND ($3::boolean = TRUE OR a.is_published = TRUE)
       ORDER BY a.created_at DESC`,
      [courseId, req.user.id, manager]
    );

    return res.json({ success: true, assignments: result.rows });
  } catch (error) {
    next(error);
  }
}

async function createAssignment(req, res, next) {
  try {
    const { courseId } = req.params;
    const {
      title,
      description,
      due_at = null,
      max_points = 100,
      is_published = false,
    } = req.body;

    if (!validId(courseId)) return fail(res, 400, "Invalid course ID.");
    if (typeof title !== "string" || title.trim().length < 2 ||
        title.trim().length > 200) {
      return fail(res, 400, "Title must contain 2–200 characters.");
    }
    if (typeof description !== "string" ||
        description.trim().length < 5 ||
        description.trim().length > 20000) {
      return fail(res, 400, "Description must contain 5–20000 characters.");
    }

    const points = Number(max_points);
    if (!Number.isFinite(points) || points <= 0 || points > 100000) {
      return fail(res, 400, "Maximum points must be greater than 0.");
    }

    if (typeof is_published !== "boolean") {
      return fail(res, 400, "is_published must be true or false.");
    }

    let dueDate = null;
    if (due_at !== null && due_at !== "") {
      dueDate = new Date(due_at);
      if (Number.isNaN(dueDate.getTime())) {
        return fail(res, 400, "Invalid due date.");
      }
    }

    const course = await getCourse(courseId);
    if (!course) return fail(res, 404, "Course not found.");
    if (!ownsCourse(req.user, course)) {
      return fail(res, 403, "You cannot create assignments for this course.");
    }

    const result = await pool.query(
      `INSERT INTO assignments
         (course_id, title, description, due_at, max_points, is_published)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        courseId, title.trim(), description.trim(),
        dueDate, points, is_published,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Assignment created.",
      assignment: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

async function submitAssignment(req, res, next) {
  try {
    const { assignmentId } = req.params;
    const { submission_text = "", submission_url = "" } = req.body;

    if (req.user.role !== "student") {
      return fail(res, 403, "Only students can submit assignments.");
    }
    if (!validId(assignmentId)) {
      return fail(res, 400, "Invalid assignment ID.");
    }

    if (typeof submission_text !== "string" ||
        typeof submission_url !== "string") {
      return fail(res, 400, "Submission text and URL must be strings.");
    }
    if (submission_text.length > 50000 || submission_url.length > 2048) {
      return fail(res, 400, "Submission exceeds the allowed length.");
    }

    if (!submission_text.trim() && !submission_url.trim()) {
      return fail(res, 400, "Provide written work or a resource URL.");
    }

    if (submission_url.trim()) {
      let parsed;
      try {
        parsed = new URL(submission_url);
      } catch (_) {
        return fail(res, 400, "Submission URL is invalid.");
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return fail(res, 400, "Submission URL must use HTTP or HTTPS.");
      }
    }

    const access = await getAssignmentAccess(req.user, assignmentId);
    const assignment = access.assignment;

    if (!assignment || !assignment.is_published) {
      return fail(res, 404, "Published assignment not found.");
    }

    if (!(await isEnrolled(req.user.id, assignment.course_id))) {
      return fail(res, 403, "You must enroll in this course first.");
    }

    if (assignment.due_at && new Date() > new Date(assignment.due_at)) {
      // This implementation closes submissions at the deadline.
      return fail(res, 409, "The assignment deadline has passed.");
    }

    const result = await pool.query(
      `INSERT INTO assignment_submissions
         (assignment_id, student_id, submission_text, submission_url, status)
       VALUES ($1, $2, $3, $4, 'submitted')
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET
         submission_text = EXCLUDED.submission_text,
         submission_url = EXCLUDED.submission_url,
         submitted_at = CURRENT_TIMESTAMP,
         grade = NULL,
         feedback = NULL,
         graded_by = NULL,
         graded_at = NULL,
         status = 'submitted'
       RETURNING id, assignment_id, student_id,
                 submission_text, submission_url, submitted_at, status`,
      [
        assignmentId, req.user.id,
        submission_text.trim() || null,
        submission_url.trim() || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Assignment submitted.",
      submission: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

async function listSubmissions(req, res, next) {
  try {
    const { assignmentId } = req.params;
    if (!validId(assignmentId)) {
      return fail(res, 400, "Invalid assignment ID.");
    }

    const access = await getAssignmentAccess(req.user, assignmentId);

    if (!access.assignment) return fail(res, 404, "Assignment not found.");
    if (!access.allowed) {
      return fail(res, 403, "You cannot view these submissions.");
    }

    const result = await pool.query(
      `SELECT s.id, s.assignment_id, s.student_id,
              s.submission_text, s.submission_url, s.submitted_at,
              s.grade, s.feedback, s.status, s.graded_at,
              u.full_name AS student_name, u.email AS student_email
       FROM assignment_submissions s
       JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = $1
       ORDER BY s.submitted_at DESC`,
      [assignmentId]
    );

    return res.json({ success: true, submissions: result.rows });
  } catch (error) {
    next(error);
  }
}

async function gradeSubmission(req, res, next) {
  try {
    const { submissionId } = req.params;
    const { grade, feedback = "" } = req.body;

    if (!validId(submissionId)) {
      return fail(res, 400, "Invalid submission ID.");
    }

    const gradeValue = Number(grade);
    if (!Number.isFinite(gradeValue) || gradeValue < 0) {
      return fail(res, 400, "Grade must be a non-negative number.");
    }
    if (typeof feedback !== "string" || feedback.length > 10000) {
      return fail(res, 400, "Feedback must be text of at most 10000 characters.");
    }

    const lookup = await pool.query(
      `SELECT s.id, s.student_id, s.grade, s.feedback,
              a.title, a.max_points,
              a.course_id, c.instructor_id
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       WHERE s.id = $1`,
      [submissionId]
    );

    const submission = lookup.rows[0];
    if (!submission) return fail(res, 404, "Submission not found.");

    if (!ownsCourse(req.user, {
      instructor_id: submission.instructor_id,
    })) {
      return fail(res, 403, "You cannot grade this submission.");
    }

    if (gradeValue > Number(submission.max_points)) {
      return fail(res, 400, `Grade cannot exceed ${submission.max_points}.`);
    }

    const result = await pool.query(
      `UPDATE assignment_submissions
       SET grade = $1, feedback = $2, graded_by = $3,
           graded_at = CURRENT_TIMESTAMP, status = 'graded'
       WHERE id = $4
       RETURNING id, assignment_id, student_id, grade,
                 feedback, graded_by, graded_at, status`,
      [gradeValue, feedback.trim(), req.user.id, submissionId]
    );

    const gradeChanged =
      submission.grade === null ||
      submission.grade === undefined ||
      Number(submission.grade) !== gradeValue ||
      (submission.feedback || "") !== feedback.trim();

    if (gradeChanged) {
      await notifyAssignmentGraded({
        userId: result.rows[0].student_id,
        assignmentTitle: submission.title,
        courseId: submission.course_id,
        submissionId: result.rows[0].id,
        grade: gradeValue,
        feedback: feedback.trim(),
      });
    }

    return res.json({
      success: true,
      message: "Submission graded.",
      submission: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

async function getMySubmissions(req, res, next) {
  try {
    if (req.user.role !== "student") {
      return fail(res, 403, "This endpoint is for students.");
    }

    const result = await pool.query(
      `SELECT s.id AS submission_id, s.assignment_id,
              s.submission_text, s.submission_url, s.submitted_at,
              s.grade, s.feedback, s.graded_at, s.status,
              a.title AS assignment_title, a.max_points, a.due_at,
              c.id AS course_id, c.title AS course_title
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       WHERE s.student_id = $1
       ORDER BY s.submitted_at DESC`,
      [req.user.id]
    );

    return res.json({ success: true, submissions: result.rows });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listAssignments,
  createAssignment,
  submitAssignment,
  listSubmissions,
  gradeSubmission,
  getMySubmissions,
};