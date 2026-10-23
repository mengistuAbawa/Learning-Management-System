
const { pool } = require("../config/db");

const validId = (value) =>
  (typeof value === "string" || typeof value === "number") &&
  /^\d+$/.test(String(value)) &&
  Number(value) > 0;

function errorResponse(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function getStudentEnrollment(studentId, courseId) {
  const result = await pool.query(
    `SELECT id, status
     FROM enrollments
     WHERE student_id = $1 AND course_id = $2
       AND status IN ('active', 'completed')
     LIMIT 1`,
    [studentId, courseId]
  );

  return result.rows[0] || null;
}

async function getCourseProgressData(studentId, courseId) {
  const enrollment = await getStudentEnrollment(studentId, courseId);

  if (!enrollment) return null;

  const result = await pool.query(
    `SELECT
       COUNT(l.id)::int AS total_lessons,
       COUNT(l.id) FILTER (WHERE lp.completed = TRUE)::int
         AS completed_lessons,
       COALESCE(SUM(l.duration_minutes), 0)::int AS total_minutes,
       COALESCE(
         SUM(l.duration_minutes) FILTER (WHERE lp.completed = TRUE),
         0
       )::int AS completed_minutes
     FROM modules m
     JOIN lessons l ON l.module_id = m.id
     LEFT JOIN lesson_progress lp
       ON lp.lesson_id = l.id AND lp.enrollment_id = $1
     WHERE m.course_id = $2`,
    [enrollment.id, courseId]
  );

  const stats = result.rows[0];
  const total = stats.total_lessons;
  const completed = stats.completed_lessons;
  const percentage =
    total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    enrollment_id: enrollment.id,
    enrollment_status: enrollment.status,
    total_lessons: total,
    completed_lessons: completed,
    remaining_lessons: Math.max(0, total - completed),
    completion_percentage: percentage,
    total_minutes: stats.total_minutes,
    completed_minutes: stats.completed_minutes,
    is_completed: total > 0 && completed === total,
  };
}

// GET /api/progress/courses/:courseId
async function getCourseProgress(req, res, next) {
  const { courseId } = req.params;

  if (!validId(courseId)) {
    return errorResponse(res, 400, "Invalid course ID.");
  }

  if (req.user?.role !== "student") {
    return errorResponse(res, 403, "This endpoint is for students.");
  }

  try {
    const course = await pool.query(
      `SELECT id, status FROM courses WHERE id = $1`,
      [courseId]
    );

    if (!course.rowCount) {
      return errorResponse(res, 404, "Course not found.");
    }

    const progress = await getCourseProgressData(req.user.id, courseId);

    if (!progress) {
      return errorResponse(
        res,
        403,
        "Enroll in this course before viewing your progress."
      );
    }

    return res.json({ success: true, data: progress });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/progress/lessons/:lessonId
// Body: { completed: true/false, last_position_seconds: 0 }
async function updateLessonProgress(req, res, next) {
  const { lessonId } = req.params;
  const { completed, last_position_seconds } = req.body;

  if (!validId(lessonId)) {
    return errorResponse(res, 400, "Invalid lesson ID.");
  }

  if (typeof completed !== "boolean") {
    return errorResponse(
      res,
      400,
      "The completed field must be true or false."
    );
  }

  const position = last_position_seconds ?? 0;

  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position > 2147483647
  ) {
    return errorResponse(
      res,
      400,
      "last_position_seconds must be a non-negative integer."
    );
  }

  if (req.user?.role !== "student") {
    return errorResponse(res, 403, "Only students can update lesson progress.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const lessonResult = await client.query(
      `SELECT l.id, l.module_id, m.course_id, c.status AS course_status
       FROM lessons l
       JOIN modules m ON m.id = l.module_id
       JOIN courses c ON c.id = m.course_id
       WHERE l.id = $1`,
      [lessonId]
    );

    const lesson = lessonResult.rows[0];

    if (!lesson) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Lesson not found.");
    }

    if (lesson.course_status !== "published") {
      await client.query("ROLLBACK");
      return errorResponse(res, 403, "This course is not available.");
    }

    const enrollmentResult = await client.query(
      `SELECT id, status
       FROM enrollments
       WHERE student_id = $1 AND course_id = $2
         AND status IN ('active', 'completed')
       FOR UPDATE`,
      [req.user.id, lesson.course_id]
    );

    const enrollment = enrollmentResult.rows[0];

    if (!enrollment) {
      await client.query("ROLLBACK");
      return errorResponse(
        res,
        403,
        "You must be enrolled to save lesson progress."
      );
    }

    await client.query(
      `INSERT INTO lesson_progress
         (enrollment_id, lesson_id, completed,
          last_position_seconds, completed_at, updated_at)
       VALUES ($1, $2, $3, $4,
               CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END,
               CURRENT_TIMESTAMP)
       ON CONFLICT (enrollment_id, lesson_id)
       DO UPDATE SET
         completed = EXCLUDED.completed,
         last_position_seconds = EXCLUDED.last_position_seconds,
         completed_at = CASE
           WHEN EXCLUDED.completed THEN
             COALESCE(lesson_progress.completed_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         updated_at = CURRENT_TIMESTAMP`,
      [enrollment.id, lesson.id, completed, position]
    );

    const statsResult = await client.query(
      `SELECT
         COUNT(l.id)::int AS total_lessons,
         COUNT(l.id) FILTER (WHERE lp.completed = TRUE)::int
           AS completed_lessons
       FROM modules m
       JOIN lessons l ON l.module_id = m.id
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.id AND lp.enrollment_id = $1
       WHERE m.course_id = $2`,
      [enrollment.id, lesson.course_id]
    );

    const total = statsResult.rows[0].total_lessons;
    const done = statsResult.rows[0].completed_lessons;
    const isCompleted = total > 0 && done === total;
    const percentage =
      total === 0 ? 0 : Math.round((done / total) * 100);

    // Completion status is derived from lesson completion.
    const newStatus = isCompleted ? "completed" : "active";

    await client.query(
      `UPDATE enrollments
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newStatus, enrollment.id]
    );

    const progressResult = await client.query(
      `SELECT id, lesson_id, completed, last_position_seconds,
              completed_at, updated_at
       FROM lesson_progress
       WHERE enrollment_id = $1 AND lesson_id = $2`,
      [enrollment.id, lesson.id]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Lesson progress saved.",
      data: {
        lesson_progress: progressResult.rows[0],
        course_progress: {
          enrollment_id: enrollment.id,
          enrollment_status: newStatus,
          total_lessons: total,
          completed_lessons: done,
          remaining_lessons: Math.max(0, total - done),
          completion_percentage: percentage,
          is_completed: isCompleted,
        },
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

// GET /api/progress/courses/:courseId/lessons
async function getCourseLessonProgress(req, res, next) {
  const { courseId } = req.params;

  if (!validId(courseId)) {
    return errorResponse(res, 400, "Invalid course ID.");
  }

  if (req.user?.role !== "student") {
    return errorResponse(res, 403, "This endpoint is for students.");
  }

  try {
    const enrollment = await getStudentEnrollment(req.user.id, courseId);

    if (!enrollment) {
      return errorResponse(res, 403, "You are not enrolled in this course.");
    }

    const result = await pool.query(
      `SELECT
         l.id AS lesson_id,
         l.module_id,
         l.title,
         l.position,
         COALESCE(lp.completed, FALSE) AS completed,
         COALESCE(lp.last_position_seconds, 0) AS last_position_seconds,
         lp.completed_at
       FROM modules m
       JOIN lessons l ON l.module_id = m.id
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.id AND lp.enrollment_id = $1
       WHERE m.course_id = $2
       ORDER BY m.position, l.position`,
      [enrollment.id, courseId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCourseProgress,
  updateLessonProgress,
  getCourseLessonProgress,
};

