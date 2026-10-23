
const { pool } = require("../config/db");

async function getStudentAnalytics(userId) {
  const coursesQuery = `
    WITH course_lesson_counts AS (
      SELECT
        c.id AS course_id,
        COUNT(l.id)::int AS total_lessons
      FROM courses c
      LEFT JOIN modules m ON m.course_id = c.id
      LEFT JOIN lessons l ON l.module_id = m.id
      GROUP BY c.id
    ),
    progress_by_enrollment AS (
      SELECT
        lp.enrollment_id,
        COUNT(*) FILTER (WHERE lp.completed)::int AS completed_lessons
      FROM lesson_progress lp
      GROUP BY lp.enrollment_id
    )
    SELECT
      e.id AS enrollment_id,
      c.id AS course_id,
      c.title,
      c.thumbnail_url,
      e.status,
      COALESCE(clc.total_lessons, 0)::int AS total_lessons,
      COALESCE(pbe.completed_lessons, 0)::int AS completed_lessons,
      CASE
        WHEN COALESCE(clc.total_lessons, 0) = 0 THEN 0
        ELSE ROUND(
          100.0 * COALESCE(pbe.completed_lessons, 0)
          / clc.total_lessons, 1
        )
      END AS completion_percentage
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN course_lesson_counts clc
      ON clc.course_id = c.id
    LEFT JOIN progress_by_enrollment pbe
      ON pbe.enrollment_id = e.id
    WHERE e.student_id = $1
    ORDER BY e.id DESC
  `;

  const assignmentQuery = `
    SELECT
      COUNT(*)::int AS total_submissions,
      COUNT(*) FILTER (WHERE s.grade IS NOT NULL)::int AS graded_submissions,
      COUNT(*) FILTER (WHERE s.grade IS NULL)::int AS awaiting_grade,
      ROUND(AVG(s.grade)::numeric, 2) AS average_grade
    FROM assignment_submissions s
    WHERE s.student_id = $1
  `;

  const [coursesResult, assignmentResult] = await Promise.all([
    pool.query(coursesQuery, [userId]),
    pool.query(assignmentQuery, [userId])
  ]);

  const courses = coursesResult.rows;
  const assignmentStats = assignmentResult.rows[0];

  const totalCourses = courses.length;
  const completedCourses = courses.filter(
    (course) => course.status === "completed"
  ).length;

  const overallCompletion = totalCourses
    ? Number((
        courses.reduce(
          (sum, course) =>
            sum + Number(course.completion_percentage),
          0
        ) / totalCourses
      ).toFixed(1))
    : 0;

  const lessonsCompleted = courses.reduce(
    (sum, course) => sum + Number(course.completed_lessons),
    0
  );

  const lessonsAvailable = courses.reduce(
    (sum, course) => sum + Number(course.total_lessons),
    0
  );

  return {
    role: "student",
    summary: {
      enrolledCourses: totalCourses,
      completedCourses,
      lessonsCompleted,
      lessonsAvailable,
      overallCompletion,
      totalSubmissions: Number(assignmentStats.total_submissions),
      gradedSubmissions: Number(assignmentStats.graded_submissions),
      awaitingGrade: Number(assignmentStats.awaiting_grade),
      averageGrade: assignmentStats.average_grade === null
        ? null
        : Number(assignmentStats.average_grade)
    },
    courses
  };
}

async function getInstructorAnalytics(userId) {
  const coursesQuery = `
    SELECT
      c.id AS course_id,
      c.title,
      c.status,
      COUNT(DISTINCT e.id)::int AS enrollment_count,
      COUNT(DISTINCT e.id) FILTER (
        WHERE e.status = 'completed'
      )::int AS completed_enrollments,
      (
        SELECT COUNT(*)::int
        FROM modules m
        JOIN lessons l ON l.module_id = m.id
        WHERE m.course_id = c.id
      ) AS total_lessons,
      (
        SELECT COUNT(*)::int
        FROM assignments a
        WHERE a.course_id = c.id
      ) AS total_assignments
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id = c.id
    WHERE c.instructor_id = $1
    GROUP BY c.id, c.title, c.status
    ORDER BY c.id DESC
  `;

  const assignmentQuery = `
    SELECT
      COUNT(s.id)::int AS total_submissions,
      COUNT(s.id) FILTER (WHERE s.grade IS NOT NULL)::int
        AS graded_submissions,
      ROUND(AVG(s.grade)::numeric, 2) AS average_grade
    FROM assignments a
    LEFT JOIN assignment_submissions s
      ON s.assignment_id = a.id
    JOIN courses c ON c.id = a.course_id
    WHERE c.instructor_id = $1
  `;

  const [coursesResult, assignmentResult] = await Promise.all([
    pool.query(coursesQuery, [userId]),
    pool.query(assignmentQuery, [userId])
  ]);

  const courses = coursesResult.rows;
  const summary = assignmentResult.rows[0];

  return {
    role: "instructor",
    summary: {
      totalCourses: courses.length,
      totalEnrollments: courses.reduce(
        (sum, course) => sum + Number(course.enrollment_count),
        0
      ),
      completedEnrollments: courses.reduce(
        (sum, course) => sum + Number(course.completed_enrollments),
        0
      ),
      totalAssignments: courses.reduce(
        (sum, course) => sum + Number(course.total_assignments),
        0
      ),
      totalSubmissions: Number(summary.total_submissions),
      gradedSubmissions: Number(summary.graded_submissions),
      averageGrade: summary.average_grade === null
        ? null
        : Number(summary.average_grade)
    },
    courses
  };
}

async function getAdminAnalytics() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS total_users,
      (SELECT COUNT(*)::int FROM users
        WHERE role = 'student') AS total_students,
      (SELECT COUNT(*)::int FROM users
        WHERE role = 'instructor') AS total_instructors,
      (SELECT COUNT(*)::int FROM courses) AS total_courses,
      (SELECT COUNT(*)::int FROM courses
        WHERE status = 'published') AS published_courses,
      (SELECT COUNT(*)::int FROM enrollments) AS total_enrollments,
      (SELECT COUNT(*)::int FROM enrollments
        WHERE status = 'completed') AS completed_enrollments,
      (SELECT COUNT(*)::int FROM lesson_progress
        WHERE completed = TRUE) AS completed_lessons,
      (SELECT COUNT(*)::int FROM assignment_submissions) AS total_submissions,
      (SELECT COUNT(*)::int FROM assignment_submissions
        WHERE grade IS NOT NULL) AS graded_submissions
  `);

  const recentUsers = await pool.query(`
    SELECT id, full_name, role, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT 8
  `);

  return {
    role: "admin",
    summary: result.rows[0],
    recentUsers: recentUsers.rows
  };
}

async function getOverview(req, res, next) {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let analytics;

    if (role === "admin") {
      analytics = await getAdminAnalytics();
    } else if (role === "instructor") {
      analytics = await getInstructorAnalytics(userId);
    } else if (role === "student") {
      analytics = await getStudentAnalytics(userId);
    } else {
      return res.status(403).json({
        success: false,
        message: "Your role is not authorized to view analytics."
      });
    }

    return res.json({
      success: true,
      analytics
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview
};
