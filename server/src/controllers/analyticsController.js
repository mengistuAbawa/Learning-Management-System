const { pool } = require("../config/db");

const HISTORY_LIMITATIONS = {
  lessonProgress:
    "Lesson progress stores only the latest state and updated timestamp. Earlier changes are not retained, so progress-by-date is not a historical event series.",
  enrollment:
    "Enrollment records contain their current status and enrollment date, but no status-change history.",
};

async function getStudentAnalytics(userId) {
  const coursesQuery = `
    WITH lesson_counts AS (
      SELECT m.course_id, COUNT(l.id)::int AS total_lessons
      FROM modules m
      LEFT JOIN lessons l ON l.module_id = m.id
      GROUP BY m.course_id
    ),
    progress AS (
      SELECT
        lp.enrollment_id,
        COUNT(*) FILTER (WHERE lp.completed)::int AS completed_lessons,
        MAX(lp.updated_at) AS last_activity_at
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id
      JOIN modules m ON m.id = l.module_id
      JOIN enrollments e
        ON e.id = lp.enrollment_id
       AND e.course_id = m.course_id
      WHERE e.student_id = $1
      GROUP BY lp.enrollment_id
    )
    SELECT
      e.id AS enrollment_id,
      c.id AS course_id,
      c.title,
      c.thumbnail_url,
      e.status,
      COALESCE(
        (to_jsonb(e)->>'enrolled_at')::timestamptz,
        (to_jsonb(e)->>'created_at')::timestamptz
      ) AS enrolled_at,
      COALESCE(lc.total_lessons, 0)::int AS total_lessons,
      COALESCE(p.completed_lessons, 0)::int AS completed_lessons,
      GREATEST(
        COALESCE(lc.total_lessons, 0) - COALESCE(p.completed_lessons, 0),
        0
      )::int AS remaining_lessons,
      CASE
        WHEN COALESCE(lc.total_lessons, 0) = 0 THEN 0
        ELSE ROUND(
          100.0 * COALESCE(p.completed_lessons, 0) / lc.total_lessons,
          1
        )
      END AS completion_percentage,
      p.last_activity_at
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN lesson_counts lc ON lc.course_id = c.id
    LEFT JOIN progress p ON p.enrollment_id = e.id
    WHERE e.student_id = $1
      AND e.status IN ('active', 'completed')
    ORDER BY enrolled_at DESC NULLS LAST, e.id DESC
  `;

  const quizSummaryQuery = `
    WITH attempts AS (
      SELECT
        a.*,
        q.course_id,
        CASE WHEN a.total_points > 0
          THEN 100.0 * a.score / a.total_points
          ELSE NULL
        END AS score_percentage
      FROM quiz_attempts a
      JOIN quizzes q ON q.id = a.quiz_id
      WHERE a.student_id = $1
        AND a.status = 'submitted'
        AND a.submitted_at IS NOT NULL
    )
    SELECT
      COUNT(*)::int AS total_attempts,
      COUNT(DISTINCT quiz_id)::int AS unique_quizzes_attempted,
      COUNT(*) FILTER (WHERE passed IS TRUE)::int AS pass_count,
      COUNT(*) FILTER (WHERE passed IS FALSE)::int AS failure_count,
      ROUND(AVG(score_percentage)::numeric, 2) AS average_score_percentage,
      ROUND(MAX(score_percentage)::numeric, 2) AS highest_score_percentage,
      ROUND(MIN(score_percentage)::numeric, 2) AS lowest_score_percentage,
      ROUND(
        (AVG(EXTRACT(EPOCH FROM (submitted_at - started_at)) / 60)
          FILTER (WHERE submitted_at >= started_at))::numeric,
        1
      ) AS average_duration_minutes
    FROM attempts
  `;

  const availableQuizzesQuery = `
    SELECT
      q.id AS quiz_id,
      q.title AS quiz_title,
      c.id AS course_id,
      c.title AS course_title,
      q.max_attempts,
      COUNT(a.id) FILTER (WHERE a.status = 'submitted')::int AS attempts_used,
      CASE
        WHEN q.max_attempts IS NULL THEN NULL
        ELSE GREATEST(q.max_attempts - COUNT(a.id) FILTER (WHERE a.status = 'submitted')::int, 0)::int
      END AS attempts_remaining
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    JOIN quizzes q ON q.course_id = c.id
    LEFT JOIN quiz_attempts a
      ON a.quiz_id = q.id AND a.student_id = e.student_id
    WHERE e.student_id = $1
      AND e.status IN ('active', 'completed')
    GROUP BY q.id, c.id, c.title, q.max_attempts
    ORDER BY c.title, q.title
  `;

  const quizCourseQuery = `
    SELECT
      c.id AS course_id,
      c.title AS course_title,
      COUNT(a.id) FILTER (WHERE a.status = 'submitted')::int AS attempts,
      COUNT(a.id) FILTER (WHERE a.status = 'submitted' AND a.passed IS TRUE)::int AS passes,
      ROUND(
        AVG(CASE WHEN a.status = 'submitted' AND a.total_points > 0
          THEN 100.0 * a.score / a.total_points
          ELSE NULL
        END)::numeric,
        2
      ) AS average_score_percentage
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN quizzes q ON q.course_id = c.id
    LEFT JOIN quiz_attempts a
      ON a.quiz_id = q.id AND a.student_id = e.student_id
    WHERE e.student_id = $1
      AND e.status IN ('active', 'completed')
    GROUP BY c.id, c.title
    ORDER BY c.title
  `;

  const quizTrendQuery = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', a.submitted_at), 'YYYY-MM') AS month,
      COUNT(*)::int AS attempts,
      ROUND(
        AVG(CASE WHEN a.total_points > 0
          THEN 100.0 * a.score / a.total_points
          ELSE NULL
        END)::numeric,
        2
      ) AS average_score_percentage
    FROM quiz_attempts a
    WHERE a.student_id = $1
      AND a.status = 'submitted'
      AND a.submitted_at IS NOT NULL
      AND a.submitted_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
    GROUP BY DATE_TRUNC('month', a.submitted_at)
    ORDER BY DATE_TRUNC('month', a.submitted_at)
  `;

  const quizDistributionQuery = `
    WITH scores AS (
      SELECT 100.0 * a.score / a.total_points AS percentage
      FROM quiz_attempts a
      WHERE a.student_id = $1
        AND a.status = 'submitted'
        AND a.submitted_at IS NOT NULL
        AND a.total_points > 0
    )
    SELECT bucket, COUNT(*)::int AS attempts
    FROM (
      SELECT CASE
        WHEN percentage < 50 THEN '0-49%'
        WHEN percentage < 70 THEN '50-69%'
        WHEN percentage < 80 THEN '70-79%'
        WHEN percentage < 90 THEN '80-89%'
        ELSE '90-100%'
      END AS bucket,
      CASE
        WHEN percentage < 50 THEN 1
        WHEN percentage < 70 THEN 2
        WHEN percentage < 80 THEN 3
        WHEN percentage < 90 THEN 4
        ELSE 5
      END AS position
      FROM scores
    ) grouped
    GROUP BY bucket, position
    ORDER BY position
  `;

  const recentAttemptsQuery = `
    SELECT
      a.id AS attempt_id,
      q.id AS quiz_id,
      q.title AS quiz_title,
      c.id AS course_id,
      c.title AS course_title,
      a.attempt_number,
      a.score AS raw_score,
      a.total_points,
      CASE WHEN a.total_points > 0
        THEN ROUND(100.0 * a.score / a.total_points, 2)
        ELSE NULL
      END AS score_percentage,
      a.passed,
      a.status,
      a.started_at,
      a.submitted_at
    FROM quiz_attempts a
    JOIN quizzes q ON q.id = a.quiz_id
    JOIN courses c ON c.id = q.course_id
    WHERE a.student_id = $1
    ORDER BY COALESCE(a.submitted_at, a.started_at) DESC
    LIMIT 10
  `;

  const assignmentsQuery = `
    WITH available AS (
      SELECT
        a.id,
        a.course_id,
        c.title AS course_title,
        a.title,
        a.due_at,
        a.max_score,
        s.id AS submission_id,
        s.submitted_at,
        s.grade,
        s.feedback,
        s.graded_at
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN assignments a
        ON a.course_id = c.id AND a.is_published = TRUE
      LEFT JOIN assignment_submissions s
        ON s.assignment_id = a.id AND s.student_id = e.student_id
      WHERE e.student_id = $1
        AND e.status IN ('active', 'completed')
    )
    SELECT
      COUNT(*)::int AS total_assignments,
      COUNT(*) FILTER (WHERE submission_id IS NOT NULL)::int AS submitted,
      COUNT(*) FILTER (WHERE submission_id IS NULL)::int AS missing,
      COUNT(*) FILTER (
        WHERE submission_id IS NULL AND due_at < CURRENT_TIMESTAMP
      )::int AS overdue,
      COUNT(*) FILTER (
        WHERE submission_id IS NOT NULL AND grade IS NOT NULL
      )::int AS graded,
      COUNT(*) FILTER (
        WHERE submission_id IS NOT NULL AND grade IS NULL
      )::int AS awaiting_grade,
      COUNT(*) FILTER (
        WHERE submission_id IS NOT NULL
          AND due_at IS NOT NULL
          AND submitted_at > due_at
      )::int AS late_submissions,
      ROUND(AVG(grade)::numeric, 2) AS average_grade,
      ROUND(AVG(100.0 * grade / NULLIF(max_score, 0))::numeric, 2)
        AS average_grade_percentage,
      ROUND(MAX(100.0 * grade / NULLIF(max_score, 0))::numeric, 2)
        AS highest_grade_percentage,
      ROUND(MIN(100.0 * grade / NULLIF(max_score, 0))::numeric, 2)
        AS lowest_grade_percentage
    FROM available
  `;

  const assignmentCourseQuery = `
    SELECT
      c.id AS course_id,
      c.title AS course_title,
      COUNT(a.id)::int AS total_assignments,
      COUNT(s.id)::int AS submitted,
      COUNT(s.id) FILTER (WHERE s.grade IS NOT NULL)::int AS graded,
      COUNT(s.id) FILTER (WHERE s.id IS NOT NULL AND s.grade IS NULL)::int
        AS awaiting_grade,
      COUNT(a.id) FILTER (
        WHERE s.id IS NULL AND a.due_at < CURRENT_TIMESTAMP
      )::int AS overdue
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN assignments a
      ON a.course_id = c.id AND a.is_published = TRUE
    LEFT JOIN assignment_submissions s
      ON s.assignment_id = a.id AND s.student_id = e.student_id
    WHERE e.student_id = $1
      AND e.status IN ('active', 'completed')
    GROUP BY c.id, c.title
    ORDER BY c.title
  `;

  const gradeDistributionQuery = `
    WITH graded AS (
      SELECT 100.0 * s.grade / NULLIF(a.max_score, 0) AS percentage
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN enrollments e
        ON e.student_id = s.student_id
       AND e.course_id = a.course_id
       AND e.status IN ('active', 'completed')
      WHERE s.student_id = $1
        AND s.grade IS NOT NULL
        AND a.is_published = TRUE
    )
    SELECT bucket, COUNT(*)::int AS submissions
    FROM (
      SELECT CASE
        WHEN percentage < 50 THEN '0-49%'
        WHEN percentage < 70 THEN '50-69%'
        WHEN percentage < 80 THEN '70-79%'
        WHEN percentage < 90 THEN '80-89%'
        ELSE '90-100%'
      END AS bucket,
      CASE
        WHEN percentage < 50 THEN 1
        WHEN percentage < 70 THEN 2
        WHEN percentage < 80 THEN 3
        WHEN percentage < 90 THEN 4
        ELSE 5
      END AS position
      FROM graded
    ) grouped
    GROUP BY bucket, position
    ORDER BY position
  `;

  const recentGradesQuery = `
    SELECT
      s.id AS submission_id,
      a.id AS assignment_id,
      a.title AS assignment_title,
      c.id AS course_id,
      c.title AS course_title,
      s.grade,
      a.max_score,
      ROUND(100.0 * s.grade / NULLIF(a.max_score, 0), 2)
        AS grade_percentage,
      s.feedback,
      s.submitted_at,
      s.graded_at,
      (a.due_at IS NOT NULL AND s.submitted_at > a.due_at) AS is_late
    FROM assignment_submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    JOIN enrollments e
      ON e.student_id = s.student_id
     AND e.course_id = a.course_id
     AND e.status IN ('active', 'completed')
    WHERE s.student_id = $1
      AND s.grade IS NOT NULL
      AND a.is_published = TRUE
    ORDER BY s.graded_at DESC NULLS LAST, s.submitted_at DESC
    LIMIT 10
  `;

  const progressActivityQuery = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', lp.updated_at), 'YYYY-MM') AS month,
      COUNT(*)::int AS progress_records_last_updated,
      COUNT(*) FILTER (WHERE lp.completed)::int AS completed_records
    FROM lesson_progress lp
    JOIN enrollments e ON e.id = lp.enrollment_id
    WHERE e.student_id = $1
      AND e.status IN ('active', 'completed')
      AND lp.updated_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
    GROUP BY DATE_TRUNC('month', lp.updated_at)
    ORDER BY DATE_TRUNC('month', lp.updated_at)
  `;

  const certificateQuery = `
    SELECT COUNT(*)::int AS earned
    FROM certificates cert
    JOIN enrollments e ON e.id = cert.enrollment_id
    WHERE e.student_id = $1
  `;

  const recentActivityQuery = `
    SELECT * FROM (
      SELECT
        'lesson_progress_latest'::text AS type,
        l.title AS title,
        c.title AS course_title,
        lp.updated_at AS activity_at
      FROM lesson_progress lp
      JOIN enrollments e ON e.id = lp.enrollment_id
      JOIN lessons l ON l.id = lp.lesson_id
      JOIN modules m ON m.id = l.module_id AND m.course_id = e.course_id
      JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = $1
        AND e.status IN ('active', 'completed')

      UNION ALL

      SELECT
        'quiz_attempt'::text,
        q.title,
        c.title,
        a.submitted_at
      FROM quiz_attempts a
      JOIN quizzes q ON q.id = a.quiz_id
      JOIN courses c ON c.id = q.course_id
      WHERE a.student_id = $1 AND a.submitted_at IS NOT NULL

      UNION ALL

      SELECT
        'assignment_submission'::text,
        a.title,
        c.title,
        s.submitted_at
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN courses c ON c.id = a.course_id
      JOIN enrollments e
        ON e.student_id = s.student_id
       AND e.course_id = a.course_id
       AND e.status IN ('active', 'completed')
      WHERE s.student_id = $1 AND a.is_published = TRUE
    ) activity
    ORDER BY activity_at DESC NULLS LAST
    LIMIT 12
  `;

  const [
    coursesResult,
    quizSummaryResult,
    availableQuizzesResult,
    quizCourseResult,
    quizTrendResult,
    quizDistributionResult,
    recentAttemptsResult,
    assignmentSummaryResult,
    assignmentCourseResult,
    gradeDistributionResult,
    recentGradesResult,
    progressActivityResult,
    certificateResult,
    recentActivityResult,
  ] = await Promise.all([
    pool.query(coursesQuery, [userId]),
    pool.query(quizSummaryQuery, [userId]),
    pool.query(availableQuizzesQuery, [userId]),
    pool.query(quizCourseQuery, [userId]),
    pool.query(quizTrendQuery, [userId]),
    pool.query(quizDistributionQuery, [userId]),
    pool.query(recentAttemptsQuery, [userId]),
    pool.query(assignmentsQuery, [userId]),
    pool.query(assignmentCourseQuery, [userId]),
    pool.query(gradeDistributionQuery, [userId]),
    pool.query(recentGradesQuery, [userId]),
    pool.query(progressActivityQuery, [userId]),
    pool.query(certificateQuery, [userId]),
    pool.query(recentActivityQuery, [userId]),
  ]);

  const courses = coursesResult.rows;
  const quizSummary = quizSummaryResult.rows[0];
  const assignmentSummary = assignmentSummaryResult.rows[0];
  const totalCourses = courses.length;
  const lessonsAvailable = courses.reduce(
    (sum, course) => sum + Number(course.total_lessons),
    0,
  );
  const lessonsCompleted = courses.reduce(
    (sum, course) => sum + Number(course.completed_lessons),
    0,
  );
  const completedEnrollments = courses.filter(
    (course) => course.status === "completed",
  ).length;

  return {
    role: "student",
    summary: {
      enrolledCourses: totalCourses,
      activeCourses: courses.filter((course) => course.status === "active")
        .length,
      completedCourses: completedEnrollments,
      overallCompletion: lessonsAvailable
        ? Number(((100 * lessonsCompleted) / lessonsAvailable).toFixed(1))
        : 0,
      lessonsAvailable,
      lessonsCompleted,
      lessonsRemaining: Math.max(0, lessonsAvailable - lessonsCompleted),
      totalQuizzesAvailable: availableQuizzesResult.rowCount,
      totalQuizAttempts: Number(quizSummary.total_attempts),
      uniqueQuizzesAttempted: Number(quizSummary.unique_quizzes_attempted),
      averageQuizScore:
        quizSummary.average_score_percentage === null
          ? null
          : Number(quizSummary.average_score_percentage),
      highestQuizScore:
        quizSummary.highest_score_percentage === null
          ? null
          : Number(quizSummary.highest_score_percentage),
      lowestQuizScore:
        quizSummary.lowest_score_percentage === null
          ? null
          : Number(quizSummary.lowest_score_percentage),
      quizPassCount: Number(quizSummary.pass_count),
      quizFailureCount: Number(quizSummary.failure_count),
      quizPassRate: Number(quizSummary.total_attempts)
        ? Number(
            (
              (100 * Number(quizSummary.pass_count)) /
              Number(quizSummary.total_attempts)
            ).toFixed(1),
          )
        : null,
      averageQuizDurationMinutes:
        quizSummary.average_duration_minutes === null
          ? null
          : Number(quizSummary.average_duration_minutes),
      totalAssignments: Number(assignmentSummary.total_assignments),
      totalSubmissions: Number(assignmentSummary.submitted),
      missingAssignments: Number(assignmentSummary.missing),
      overdueAssignments: Number(assignmentSummary.overdue),
      gradedSubmissions: Number(assignmentSummary.graded),
      awaitingGrade: Number(assignmentSummary.awaiting_grade),
      lateSubmissions: Number(assignmentSummary.late_submissions),
      averageGrade:
        assignmentSummary.average_grade === null
          ? null
          : Number(assignmentSummary.average_grade),
      averageGradePercentage:
        assignmentSummary.average_grade_percentage === null
          ? null
          : Number(assignmentSummary.average_grade_percentage),
      highestGradePercentage:
        assignmentSummary.highest_grade_percentage === null
          ? null
          : Number(assignmentSummary.highest_grade_percentage),
      lowestGradePercentage:
        assignmentSummary.lowest_grade_percentage === null
          ? null
          : Number(assignmentSummary.lowest_grade_percentage),
      certificatesEarned: Number(certificateResult.rows[0].earned),
    },
    courses,
    quizAnalytics: {
      availableQuizzes: availableQuizzesResult.rows,
      byCourse: quizCourseResult.rows,
      scoreTrend: quizTrendResult.rows,
      scoreDistribution: quizDistributionResult.rows,
      recentAttempts: recentAttemptsResult.rows,
    },
    assignmentAnalytics: {
      byCourse: assignmentCourseResult.rows,
      gradeDistribution: gradeDistributionResult.rows,
      recentGrades: recentGradesResult.rows,
    },
    progressRecordUpdates: progressActivityResult.rows,
    recentActivity: recentActivityResult.rows,
    historyLimitations: HISTORY_LIMITATIONS,
  };
}

async function getInstructorAnalytics(userId) {
  const coursesQuery = `
    SELECT
      c.id AS course_id,
      c.title,
      c.status,
      (SELECT COUNT(*)::int FROM modules m WHERE m.course_id = c.id)
        AS total_modules,
      (SELECT COUNT(*)::int
       FROM modules m JOIN lessons l ON l.module_id = m.id
       WHERE m.course_id = c.id) AS total_lessons,
      (SELECT COUNT(*)::int FROM enrollments e
       WHERE e.course_id = c.id
         AND e.status IN ('active', 'completed')) AS enrollment_count,
      (SELECT COUNT(*)::int FROM enrollments e
       WHERE e.course_id = c.id AND e.status = 'active') AS active_enrollments,
      (SELECT COUNT(*)::int FROM enrollments e
       WHERE e.course_id = c.id AND e.status = 'completed') AS completed_enrollments,
      (SELECT COUNT(*)::int FROM quizzes q
       WHERE q.course_id = c.id) AS total_quizzes,
      (SELECT COUNT(*)::int FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       WHERE q.course_id = c.id AND qa.status = 'submitted'
         AND qa.submitted_at IS NOT NULL) AS quiz_attempts,
      (SELECT ROUND(AVG(
         CASE WHEN qa.total_points > 0
           THEN 100.0 * qa.score / qa.total_points
           ELSE NULL
         END
       )::numeric, 2)
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       WHERE q.course_id = c.id AND qa.status = 'submitted'
         AND qa.submitted_at IS NOT NULL) AS average_quiz_percentage,
      (SELECT COUNT(*)::int FROM assignments a
       WHERE a.course_id = c.id) AS total_assignments,
      (SELECT COUNT(*)::int FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.course_id = c.id) AS total_submissions,
      (SELECT COUNT(*)::int FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.course_id = c.id AND s.grade IS NOT NULL) AS graded_submissions,
      (SELECT COUNT(*)::int FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.course_id = c.id AND s.grade IS NULL) AS awaiting_grade,
      (SELECT ROUND(AVG(s.grade)::numeric, 2)
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.course_id = c.id AND s.grade IS NOT NULL) AS average_grade,
      (SELECT ROUND(AVG(
         100.0 * s.grade / NULLIF(a.max_score, 0)
       )::numeric, 2)
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.course_id = c.id AND s.grade IS NOT NULL) AS average_grade_percentage,
      (SELECT ROUND(
         100.0 * COUNT(*) FILTER (WHERE e.status = 'completed')
         / NULLIF(COUNT(*) FILTER (WHERE e.status IN ('active', 'completed')), 0),
         1
       )
       FROM enrollments e
       WHERE e.course_id = c.id) AS completion_rate
    FROM courses c
    WHERE c.instructor_id = $1
    ORDER BY c.id DESC
  `;

  const courseProgressQuery = `
    WITH lesson_counts AS (
      SELECT m.course_id, COUNT(l.id)::int AS total_lessons
      FROM modules m
      LEFT JOIN lessons l ON l.module_id = m.id
      GROUP BY m.course_id
    ),
    enrollment_progress AS (
      SELECT
        c.id AS course_id,
        e.id AS enrollment_id,
        COALESCE(lc.total_lessons, 0) AS total_lessons,
        COUNT(lp.id) FILTER (WHERE lp.completed)::int AS completed_lessons
      FROM courses c
      JOIN enrollments e ON e.course_id = c.id
        AND e.status IN ('active', 'completed')
      LEFT JOIN lesson_counts lc ON lc.course_id = c.id
      LEFT JOIN modules m ON m.course_id = c.id
      LEFT JOIN lessons l ON l.module_id = m.id
      LEFT JOIN lesson_progress lp
        ON lp.enrollment_id = e.id AND lp.lesson_id = l.id
      WHERE c.instructor_id = $1
      GROUP BY c.id, e.id, lc.total_lessons
    )
    SELECT
      course_id,
      COUNT(*) FILTER (
        WHERE total_lessons > 0
          AND 100.0 * completed_lessons / total_lessons < 25
      )::int AS below_25_percent,
      COUNT(*) FILTER (
        WHERE total_lessons > 0
          AND 100.0 * completed_lessons / total_lessons >= 25
          AND 100.0 * completed_lessons / total_lessons < 50
      )::int AS from_25_to_49_percent,
      COUNT(*) FILTER (
        WHERE total_lessons > 0
          AND 100.0 * completed_lessons / total_lessons >= 50
          AND 100.0 * completed_lessons / total_lessons < 75
      )::int AS from_50_to_74_percent,
      COUNT(*) FILTER (
        WHERE total_lessons > 0
          AND 100.0 * completed_lessons / total_lessons >= 75
          AND completed_lessons < total_lessons
      )::int AS from_75_to_99_percent,
      COUNT(*) FILTER (
        WHERE total_lessons > 0 AND completed_lessons = total_lessons
      )::int AS complete,
      COUNT(*) FILTER (WHERE total_lessons = 0)::int AS no_lessons
    FROM enrollment_progress
    GROUP BY course_id
    ORDER BY course_id
  `;

  const monthlyActivityQuery = `
    WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS month
    ),
    quiz_activity AS (
      SELECT DATE_TRUNC('month', qa.submitted_at) AS month, COUNT(*)::int AS count
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN courses c ON c.id = q.course_id
      WHERE c.instructor_id = $1 AND qa.status = 'submitted'
        AND qa.submitted_at IS NOT NULL
      GROUP BY 1
    ),
    assignment_activity AS (
      SELECT DATE_TRUNC('month', s.submitted_at) AS month, COUNT(*)::int AS count
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN courses c ON c.id = a.course_id
      WHERE c.instructor_id = $1
      GROUP BY 1
    ),
    grading_activity AS (
      SELECT DATE_TRUNC('month', s.graded_at) AS month, COUNT(*)::int AS count
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN courses c ON c.id = a.course_id
      WHERE c.instructor_id = $1 AND s.graded_at IS NOT NULL
      GROUP BY 1
    )
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      COALESCE(qa.count, 0)::int AS quiz_attempts,
      COALESCE(sa.count, 0)::int AS assignment_submissions,
      COALESCE(ga.count, 0)::int AS assignments_graded
    FROM months m
    LEFT JOIN quiz_activity qa USING (month)
    LEFT JOIN assignment_activity sa USING (month)
    LEFT JOIN grading_activity ga USING (month)
    ORDER BY m.month
  `;

  const gradingQuery = `
    SELECT
      COUNT(*) FILTER (WHERE s.grade IS NULL)::int AS awaiting_grade,
      COUNT(*) FILTER (WHERE s.grade IS NOT NULL)::int AS graded_submissions,
      ROUND(
        (AVG(s.grade) FILTER (WHERE s.grade IS NOT NULL))::numeric,
        2
      ) AS average_grade,
      ROUND(
        (AVG(100.0 * s.grade / NULLIF(a.max_score, 0))
          FILTER (WHERE s.grade IS NOT NULL))::numeric,
        2
      ) AS average_grade_percentage,
      ROUND(
        (AVG(EXTRACT(EPOCH FROM (s.graded_at - s.submitted_at)) / 3600)
          FILTER (
            WHERE s.graded_at IS NOT NULL AND s.graded_at >= s.submitted_at
          ))::numeric,
        1
      ) AS average_turnaround_hours
    FROM courses c
    JOIN assignments a ON a.course_id = c.id
    JOIN assignment_submissions s ON s.assignment_id = a.id
    WHERE c.instructor_id = $1
  `;

  const recentGradingQuery = `
    SELECT
      s.id AS submission_id,
      s.assignment_id,
      a.title AS assignment_title,
      c.id AS course_id,
      c.title AS course_title,
      u.id AS student_id,
      u.full_name AS student_name,
      s.grade,
      a.max_score,
      s.graded_at,
      s.submitted_at,
      s.feedback
    FROM courses c
    JOIN assignments a ON a.course_id = c.id
    JOIN assignment_submissions s ON s.assignment_id = a.id
    JOIN users u ON u.id = s.student_id
    WHERE c.instructor_id = $1 AND s.grade IS NOT NULL
    ORDER BY s.graded_at DESC NULLS LAST
    LIMIT 10
  `;

  const activityQuery = `
    SELECT * FROM (
      SELECT
        'lesson_progress_latest'::text AS type,
        l.title AS title,
        c.title AS course_title,
        lp.updated_at AS activity_at
      FROM courses c
      JOIN modules m ON m.course_id = c.id
      JOIN lessons l ON l.module_id = m.id
      JOIN lesson_progress lp ON lp.lesson_id = l.id
      JOIN enrollments e ON e.id = lp.enrollment_id AND e.course_id = c.id
      WHERE c.instructor_id = $1

      UNION ALL

      SELECT
        'quiz_attempt'::text,
        q.title,
        c.title,
        qa.submitted_at
      FROM courses c
      JOIN quizzes q ON q.course_id = c.id
      JOIN quiz_attempts qa ON qa.quiz_id = q.id
      WHERE c.instructor_id = $1 AND qa.submitted_at IS NOT NULL

      UNION ALL

      SELECT
        'assignment_submission'::text,
        a.title,
        c.title,
        s.submitted_at
      FROM courses c
      JOIN assignments a ON a.course_id = c.id
      JOIN assignment_submissions s ON s.assignment_id = a.id
      WHERE c.instructor_id = $1
    ) activity
    ORDER BY activity_at DESC NULLS LAST
    LIMIT 12
  `;

  const [
    coursesResult,
    progressResult,
    activityResult,
    gradingResult,
    recentGradingResult,
    monthlyActivityResult,
  ] = await Promise.all([
    pool.query(coursesQuery, [userId]),
    pool.query(courseProgressQuery, [userId]),
    pool.query(activityQuery, [userId]),
    pool.query(gradingQuery, [userId]),
    pool.query(recentGradingQuery, [userId]),
    pool.query(monthlyActivityQuery, [userId]),
  ]);

  const courses = coursesResult.rows;
  const totals = courses.reduce(
    (summary, course) => {
      summary.totalModules += Number(course.total_modules);
      summary.totalLessons += Number(course.total_lessons);
      summary.totalEnrollments += Number(course.enrollment_count);
      summary.activeEnrollments += Number(course.active_enrollments);
      summary.completedEnrollments += Number(course.completed_enrollments);
      summary.totalQuizzes += Number(course.total_quizzes);
      summary.quizAttempts += Number(course.quiz_attempts);
      summary.totalAssignments += Number(course.total_assignments);
      summary.totalSubmissions += Number(course.total_submissions);
      summary.gradedSubmissions += Number(course.graded_submissions);
      summary.awaitingGrade += Number(course.awaiting_grade);
      summary.publishedCourses += course.status === "published" ? 1 : 0;
      summary.draftCourses += course.status === "draft" ? 1 : 0;
      return summary;
    },
    {
      totalModules: 0,
      totalLessons: 0,
      totalEnrollments: 0,
      activeEnrollments: 0,
      completedEnrollments: 0,
      totalQuizzes: 0,
      quizAttempts: 0,
      totalAssignments: 0,
      totalSubmissions: 0,
      gradedSubmissions: 0,
      awaitingGrade: 0,
      publishedCourses: 0,
      draftCourses: 0,
    },
  );
  const grading = gradingResult.rows[0];

  totals.courseCompletionRate = totals.totalEnrollments
    ? Number(
        ((100 * totals.completedEnrollments) / totals.totalEnrollments).toFixed(
          1,
        ),
      )
    : 0;
  totals.averageQuizPerformance = courses.length
    ? averageNonNull(courses.map((course) => course.average_quiz_percentage))
    : null;

  return {
    role: "instructor",
    summary: {
      totalCourses: courses.length,
      ...totals,
      averageGrade:
        grading.average_grade === null ? null : Number(grading.average_grade),
      averageGradePercentage:
        grading.average_grade_percentage === null
          ? null
          : Number(grading.average_grade_percentage),
      averageGradingTurnaroundHours:
        grading.average_turnaround_hours === null
          ? null
          : Number(grading.average_turnaround_hours),
    },
    courses,
    courseProgressDistribution: progressResult.rows,
    activityByMonth: monthlyActivityResult.rows,
    gradingDistribution: await getInstructorGradeDistribution(userId),
    recentGrading: recentGradingResult.rows,
    recentActivity: activityResult.rows,
    historyLimitations: HISTORY_LIMITATIONS,
  };
}

async function getInstructorGradeDistribution(userId) {
  const result = await pool.query(
    `WITH grades AS (
       SELECT 100.0 * s.grade / NULLIF(a.max_score, 0) AS percentage
       FROM courses c
       JOIN assignments a ON a.course_id = c.id
       JOIN assignment_submissions s ON s.assignment_id = a.id
       WHERE c.instructor_id = $1
     )
     SELECT bucket, COUNT(*)::int AS submissions
     FROM (
       SELECT
         CASE
           WHEN percentage < 50 THEN '0-49%'
           WHEN percentage < 70 THEN '50-69%'
           WHEN percentage < 80 THEN '70-79%'
           WHEN percentage < 90 THEN '80-89%'
           ELSE '90-100%'
         END AS bucket,
         CASE
           WHEN percentage < 50 THEN 1
           WHEN percentage < 70 THEN 2
           WHEN percentage < 80 THEN 3
           WHEN percentage < 90 THEN 4
           ELSE 5
         END AS position
       FROM grades
     ) grouped
     GROUP BY bucket, position
     ORDER BY position`,
    [userId],
  );
  return result.rows;
}

function averageNonNull(values) {
  const numericValues = values
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);

  return numericValues.length
    ? Number(
        (
          numericValues.reduce((sum, value) => sum + value, 0) /
          numericValues.length
        ).toFixed(2),
      )
    : null;
}

async function getInstructorStudentPerformance(req, res, next) {
  if (req.user.role !== "instructor") {
    return res.status(403).json({
      success: false,
      message: "Only instructors can view course student analytics.",
    });
  }

  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 20);
  const courseId = req.query.courseId ?? null;
  const status = req.query.status ?? null;
  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim().slice(0, 100)
      : null;
  const sortBy = req.query.sortBy ?? "enrolled_at";
  const sortOrder = req.query.sortOrder ?? "desc";
  const sortColumns = {
    enrolled_at: "enrolled_at",
    student_name: "student_name",
    status: "status",
    completion_percentage: "completion_percentage",
    quiz_average: "quiz_average",
    assignment_average: "assignment_average",
    ungraded_assignments: "ungraded_assignments",
  };

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50
  ) {
    return res.status(400).json({
      success: false,
      message: "Page must be positive and pageSize must be between 1 and 50.",
    });
  }
  if (courseId !== null && !/^[1-9]\d*$/.test(String(courseId))) {
    return res.status(400).json({
      success: false,
      message: "Invalid course ID.",
    });
  }
  if (
    status !== null &&
    !["active", "completed", "cancelled"].includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid enrollment status filter.",
    });
  }
  if (
    !Object.hasOwn(sortColumns, sortBy) ||
    !["asc", "desc"].includes(sortOrder)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid sorting option.",
    });
  }

  try {
    const whereSql = `
      c.instructor_id = $1
      AND ($2::bigint IS NULL OR c.id = $2)
      AND ($3::text IS NULL OR e.status = $3)
      AND ($4::text IS NULL OR
        u.full_name ILIKE '%' || $4 || '%' OR u.email ILIKE '%' || $4 || '%')
    `;
    const filterValues = [req.user.id, courseId, status, search || null];

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN users u ON u.id = e.student_id
       WHERE ${whereSql}`,
      filterValues,
    );

    const sortColumn = sortColumns[sortBy];
    const sortDirection = sortOrder.toUpperCase();
    const dataResult = await pool.query(
      `WITH filtered AS (
         SELECT
           e.id AS enrollment_id,
           e.student_id,
           e.course_id,
           e.status,
           COALESCE(
             (to_jsonb(e)->>'enrolled_at')::timestamptz,
             (to_jsonb(e)->>'created_at')::timestamptz
           ) AS enrolled_at,
           u.full_name AS student_name,
           u.email AS student_email,
           c.title AS course_title,
           (SELECT COUNT(*)::int
            FROM modules m JOIN lessons l ON l.module_id = m.id
            WHERE m.course_id = c.id) AS total_lessons
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         JOIN users u ON u.id = e.student_id
         WHERE ${whereSql}
       ),
       progress AS (
         SELECT
           f.enrollment_id,
           COUNT(lp.id) FILTER (WHERE lp.completed)::int AS completed_lessons,
           MAX(lp.updated_at) AS last_activity_at
         FROM filtered f
         LEFT JOIN modules m ON m.course_id = f.course_id
         LEFT JOIN lessons l ON l.module_id = m.id
         LEFT JOIN lesson_progress lp
           ON lp.enrollment_id = f.enrollment_id AND lp.lesson_id = l.id
         GROUP BY f.enrollment_id
       ),
       quizzes AS (
         SELECT
           f.enrollment_id,
           ROUND(AVG(
             CASE WHEN qa.total_points > 0
               THEN 100.0 * qa.score / qa.total_points
               ELSE NULL
             END
           )::numeric, 2) AS quiz_average
         FROM filtered f
         LEFT JOIN quizzes q ON q.course_id = f.course_id
         LEFT JOIN quiz_attempts qa
           ON qa.quiz_id = q.id
          AND qa.student_id = f.student_id
          AND qa.status = 'submitted'
          AND qa.submitted_at IS NOT NULL
         GROUP BY f.enrollment_id
       ),
       assignment_metrics AS (
         SELECT
           f.enrollment_id,
           ROUND(AVG(
             CASE WHEN s.grade IS NOT NULL
               THEN 100.0 * s.grade / NULLIF(a.max_score, 0)
               ELSE NULL
             END
           )::numeric, 2) AS assignment_average,
           COUNT(s.id) FILTER (WHERE s.grade IS NULL)::int
             AS ungraded_assignments
         FROM filtered f
         LEFT JOIN assignments a
           ON a.course_id = f.course_id AND a.is_published = TRUE
         LEFT JOIN assignment_submissions s
           ON s.assignment_id = a.id AND s.student_id = f.student_id
         GROUP BY f.enrollment_id
       )
       SELECT
         f.enrollment_id,
         f.student_id,
         f.student_name,
         f.student_email,
         f.course_id,
         f.course_title,
         f.status,
         f.enrolled_at,
         f.total_lessons,
         COALESCE(p.completed_lessons, 0)::int AS completed_lessons,
         GREATEST(f.total_lessons - COALESCE(p.completed_lessons, 0), 0)::int
           AS remaining_lessons,
         CASE WHEN f.total_lessons = 0 THEN 0
           ELSE ROUND(
             100.0 * COALESCE(p.completed_lessons, 0) / f.total_lessons,
             1
           )
         END AS completion_percentage,
         p.last_activity_at,
         q.quiz_average,
         a.assignment_average,
         COALESCE(a.ungraded_assignments, 0)::int AS ungraded_assignments
       FROM filtered f
       LEFT JOIN progress p ON p.enrollment_id = f.enrollment_id
       LEFT JOIN quizzes q ON q.enrollment_id = f.enrollment_id
       LEFT JOIN assignment_metrics a ON a.enrollment_id = f.enrollment_id
       ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, f.enrollment_id DESC
       LIMIT $5 OFFSET $6`,
      [...filterValues, pageSize, (page - 1) * pageSize],
    );

    return res.json({
      success: true,
      students: dataResult.rows,
      pagination: {
        page,
        pageSize,
        total: Number(countResult.rows[0].total),
        totalPages: Math.ceil(Number(countResult.rows[0].total) / pageSize),
      },
      filters: { courseId, status, search, sortBy, sortOrder },
    });
  } catch (error) {
    next(error);
  }
}

async function getAdminAnalytics() {
  const summaryResult = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS total_users,
      (SELECT COUNT(*)::int FROM users WHERE role = 'student') AS total_students,
      (SELECT COUNT(*)::int FROM users WHERE role = 'instructor') AS total_instructors,
      (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS total_administrators,
      (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS active_users,
      (SELECT COUNT(*)::int FROM users WHERE is_active = FALSE) AS inactive_users,
      (SELECT COUNT(*)::int FROM courses) AS total_courses,
      (SELECT COUNT(*)::int FROM courses WHERE status = 'published') AS published_courses,
      (SELECT COUNT(*)::int FROM courses WHERE status = 'draft') AS draft_courses,
      (SELECT COUNT(*)::int FROM courses WHERE status = 'archived') AS archived_courses,
      (SELECT COUNT(*)::int FROM modules) AS total_modules,
      (SELECT COUNT(*)::int FROM lessons) AS total_lessons,
      (SELECT COUNT(*)::int FROM enrollments) AS total_enrollments,
      (SELECT COUNT(*)::int FROM enrollments WHERE status = 'active') AS active_enrollments,
      (SELECT COUNT(*)::int FROM enrollments WHERE status = 'completed') AS completed_enrollments,
      (SELECT COUNT(*)::int FROM lesson_progress WHERE completed = TRUE) AS completed_lesson_records,
      (SELECT COUNT(*)::int FROM quizzes WHERE is_published = TRUE) AS published_quizzes,
      (SELECT COUNT(*)::int FROM quiz_attempts) AS total_quiz_attempts,
      (SELECT COUNT(*)::int FROM quiz_attempts
        WHERE status = 'submitted' AND submitted_at IS NOT NULL) AS submitted_quiz_attempts,
      (SELECT COUNT(*)::int FROM quiz_attempts WHERE passed IS TRUE) AS quiz_passes,
      (SELECT ROUND(AVG(
        CASE WHEN total_points > 0 THEN 100.0 * score / total_points ELSE NULL END
      )::numeric, 2)
        FROM quiz_attempts
        WHERE status = 'submitted' AND submitted_at IS NOT NULL) AS average_quiz_percentage,
      (SELECT COUNT(*)::int FROM assignments) AS total_assignments,
      (SELECT COUNT(*)::int FROM assignment_submissions) AS total_submissions,
      (SELECT COUNT(*)::int FROM assignment_submissions WHERE grade IS NOT NULL) AS graded_submissions,
      (SELECT COUNT(*)::int FROM assignment_submissions WHERE grade IS NULL) AS awaiting_grade,
      (SELECT ROUND(AVG(100.0 * s.grade / NULLIF(a.max_score, 0))::numeric, 2)
        FROM assignment_submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE s.grade IS NOT NULL) AS average_assignment_percentage,
      (SELECT COUNT(*)::int FROM certificates) AS certificates_issued
  `);

  const recentUsersResult = await pool.query(`
    SELECT id, full_name, role, is_active, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT 8
  `);

  const trendsResult = await pool.query(`
    WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS month
    ),
    user_activity AS (
      SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)::int AS count
      FROM users
      GROUP BY 1
    ),
    enrollment_activity AS (
      SELECT DATE_TRUNC(
        'month',
        COALESCE(
          (to_jsonb(e)->>'enrolled_at')::timestamptz,
          (to_jsonb(e)->>'created_at')::timestamptz
        )
      ) AS month, COUNT(*)::int AS count
      FROM enrollments e
      GROUP BY 1
    ),
    course_activity AS (
      SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)::int AS created
      FROM courses
      GROUP BY 1
    ),
    publishing_activity AS (
      SELECT DATE_TRUNC('month', published_at) AS month, COUNT(*)::int AS published
      FROM courses
      WHERE published_at IS NOT NULL
      GROUP BY 1
    ),
    quiz_activity AS (
      SELECT DATE_TRUNC('month', submitted_at) AS month, COUNT(*)::int AS count
      FROM quiz_attempts
      WHERE status = 'submitted' AND submitted_at IS NOT NULL
      GROUP BY 1
    ),
    assignment_activity AS (
      SELECT DATE_TRUNC('month', submitted_at) AS month, COUNT(*)::int AS count
      FROM assignment_submissions
      GROUP BY 1
    ),
    grading_activity AS (
      SELECT DATE_TRUNC('month', graded_at) AS month, COUNT(*)::int AS count
      FROM assignment_submissions
      WHERE graded_at IS NOT NULL
      GROUP BY 1
    )
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      COALESCE(ua.count, 0)::int AS new_users,
      COALESCE(ea.count, 0)::int AS new_enrollments,
      COALESCE(ca.created, 0)::int AS courses_created,
      COALESCE(pa.published, 0)::int AS courses_published,
      COALESCE(qa.count, 0)::int AS quiz_attempts,
      COALESCE(sa.count, 0)::int AS assignment_submissions,
      COALESCE(ga.count, 0)::int AS assignments_graded
    FROM months m
    LEFT JOIN user_activity ua USING (month)
    LEFT JOIN enrollment_activity ea USING (month)
    LEFT JOIN course_activity ca USING (month)
    LEFT JOIN publishing_activity pa USING (month)
    LEFT JOIN quiz_activity qa USING (month)
    LEFT JOIN assignment_activity sa USING (month)
    LEFT JOIN grading_activity ga USING (month)
    ORDER BY m.month
  `);

  const recentActivityResult = await pool.query(`
    SELECT * FROM (
      SELECT
        'lesson_progress_latest'::text AS type,
        l.title AS title,
        c.title AS course_title,
        u.full_name AS user_name,
        lp.updated_at AS activity_at
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id
      JOIN modules m ON m.id = l.module_id
      JOIN courses c ON c.id = m.course_id
      JOIN users u ON u.id = (
        SELECT e.student_id FROM enrollments e
        WHERE e.id = lp.enrollment_id AND e.course_id = c.id
      )

      UNION ALL

      SELECT
        'quiz_attempt'::text,
        q.title,
        c.title,
        u.full_name,
        a.submitted_at
      FROM quiz_attempts a
      JOIN quizzes q ON q.id = a.quiz_id
      JOIN courses c ON c.id = q.course_id
      JOIN users u ON u.id = a.student_id
      WHERE a.submitted_at IS NOT NULL

      UNION ALL

      SELECT
        'assignment_submission'::text,
        a.title,
        c.title,
        u.full_name,
        s.submitted_at
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = s.student_id
    ) activity
    ORDER BY activity_at DESC NULLS LAST
    LIMIT 15
  `);

  const summary = summaryResult.rows[0];
  summary.course_completion_rate = Number(summary.total_enrollments)
    ? Number(
        (
          (100 * Number(summary.completed_enrollments)) /
          Number(summary.total_enrollments)
        ).toFixed(1),
      )
    : 0;
  summary.quiz_pass_rate = Number(summary.submitted_quiz_attempts)
    ? Number(
        (
          (100 * Number(summary.quiz_passes)) /
          Number(summary.submitted_quiz_attempts)
        ).toFixed(1),
      )
    : null;

  return {
    role: "admin",
    summary,
    monthlyTrends: trendsResult.rows,
    recentUsers: recentUsersResult.rows,
    recentActivity: recentActivityResult.rows,
    historyLimitations: HISTORY_LIMITATIONS,
  };
}

async function getOverview(req, res, next) {
  try {
    const { id: userId, role } = req.user;
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
        message: "Your role is not authorized to view analytics.",
      });
    }

    return res.json({ success: true, analytics });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview,
  getInstructorStudentPerformance,
};
