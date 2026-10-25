const { pool } = require("../config/db");

const ROLES = new Set(["student", "instructor"]);
const ACCOUNT_FILTERS = new Set([
  "all",
  "active",
  "suspended",
  "pending",
  "approved",
  "rejected",
]);
const COURSE_STATUSES = new Set(["all", "draft", "published", "archived"]);
const ENROLLMENT_STATUSES = new Set(["all", "active", "completed", "cancelled"]);

function errorResponse(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function pagination(query) {
  const rawPage = query.page === undefined ? "1" : String(query.page);
  const rawLimit = query.limit === undefined ? "20" : String(query.limit);
  if (!/^[1-9]\d*$/.test(rawPage) || !/^[1-9]\d*$/.test(rawLimit)) return null;
  const page = Number(rawPage);
  const limit = Math.min(Number(rawLimit), 100);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit)) return null;
  return { page, limit, offset: (page - 1) * limit };
}

function queryText(value, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sendPage(res, rows, total, page, limit, collection) {
  return res.json({
    success: true,
    [collection]: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      has_more: page * limit < total,
    },
  });
}

async function getOverview(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role = 'student' AND approval_status = 'approved') AS total_students,
        (SELECT COUNT(*)::int FROM users WHERE role = 'instructor') AS total_instructors,
        (SELECT COUNT(*)::int FROM users WHERE role = 'instructor' AND approval_status = 'pending') AS pending_instructors,
        (SELECT COUNT(*)::int FROM users WHERE role = 'instructor' AND approval_status = 'approved') AS approved_instructors,
        (SELECT COUNT(*)::int FROM users WHERE role = 'instructor' AND is_active = TRUE AND approval_status = 'approved') AS active_instructors,
        (SELECT COUNT(*)::int FROM courses) AS total_courses,
        (SELECT COUNT(*)::int FROM courses WHERE status = 'published') AS published_courses,
        (SELECT COUNT(*)::int FROM enrollments) AS total_enrollments,
        (SELECT COUNT(*)::int FROM enrollments WHERE status IN ('active', 'completed')) AS eligible_enrollments,
        (SELECT COUNT(*)::int FROM enrollments WHERE status = 'completed') AS completed_enrollments,
        (SELECT COUNT(DISTINCT student_id)::int FROM enrollments) AS unique_enrolled_students
    `);
    const summary = result.rows[0];
    const eligibleEnrollmentCount = Number(summary.eligible_enrollments);
    summary.course_completion_rate = eligibleEnrollmentCount
      ? Number(((100 * Number(summary.completed_enrollments)) / eligibleEnrollmentCount).toFixed(1))
      : 0;
    return res.json({ success: true, summary });
  } catch (error) {
    return next(error);
  }
}

async function getAnalytics(req, res, next) {
  const rawMonths = req.query.months === undefined ? "12" : String(req.query.months);
  if (!/^(3|6|12|24)$/.test(rawMonths)) {
    return errorResponse(res, 400, "months must be 3, 6, 12, or 24.");
  }
  const months = Number(rawMonths);
  try {
    const [trendResult, statusResult, popularResult, instructorResult] =
      await Promise.all([
        pool.query(
          `WITH months AS (
             SELECT generate_series(
               DATE_TRUNC('month', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 month'),
               DATE_TRUNC('month', CURRENT_DATE),
               INTERVAL '1 month'
             ) AS month
           ),
           registrations AS (
             SELECT DATE_TRUNC('month', created_at) AS month,
                    COUNT(*) FILTER (WHERE role = 'student')::int AS students,
                    COUNT(*) FILTER (WHERE role = 'instructor')::int AS instructors
             FROM users
             WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 month')
             GROUP BY 1
           ),
           enrollments_by_month AS (
             SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)::int AS enrollments
             FROM enrollments
             WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 month')
             GROUP BY 1
           )
           SELECT TO_CHAR(m.month, 'YYYY-MM') AS month,
                  COALESCE(r.students, 0)::int AS students,
                  COALESCE(r.instructors, 0)::int AS instructors,
                  COALESCE(e.enrollments, 0)::int AS enrollments
           FROM months m
           LEFT JOIN registrations r USING (month)
           LEFT JOIN enrollments_by_month e USING (month)
           ORDER BY m.month`,
          [months],
        ),
        pool.query(
          `SELECT 'courses'::text AS metric, status AS label, COUNT(*)::int AS count
             FROM courses GROUP BY status
           UNION ALL
           SELECT 'instructors', approval_status, COUNT(*)::int
             FROM users WHERE role = 'instructor' GROUP BY approval_status
           UNION ALL
           SELECT 'instructor_accounts',
                  CASE WHEN is_active THEN 'active' ELSE 'suspended' END,
                  COUNT(*)::int
             FROM users WHERE role = 'instructor'
             GROUP BY CASE WHEN is_active THEN 'active' ELSE 'suspended' END
           UNION ALL
           SELECT 'enrollments', status, COUNT(*)::int
             FROM enrollments GROUP BY status
           ORDER BY metric, label`,
        ),
        pool.query(
          `SELECT c.id, c.title, c.status,
                  u.full_name AS instructor_name,
                  COUNT(e.id)::int AS enrollment_count,
                  COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completed_enrollments
           FROM courses c
           JOIN users u ON u.id = c.instructor_id
           LEFT JOIN enrollments e ON e.course_id = c.id
           GROUP BY c.id, c.title, c.status, u.full_name
           ORDER BY COUNT(e.id) DESC, c.id DESC
           LIMIT 10`,
        ),
        pool.query(
          `SELECT approval_status AS status, COUNT(*)::int AS count
           FROM users WHERE role = 'instructor'
           GROUP BY approval_status ORDER BY approval_status`,
        ),
      ]);
    return res.json({
      success: true,
      range_months: months,
      trends: trendResult.rows,
      distributions: statusResult.rows,
      popular_courses: popularResult.rows,
      instructor_status: instructorResult.rows,
      metric_definitions: {
        enrollments: "Enrollment records created during the month (not unique students).",
        completion_rate: "Completed enrollment records divided by active and completed enrollment records; cancelled records are excluded.",
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getPeople(req, res, next) {
  const role = req.params.role;
  const pageInfo = pagination(req.query);
  const status = req.query.status === undefined ? "all" : String(req.query.status);
  if (!ROLES.has(role)) return errorResponse(res, 404, "Unknown account directory.");
  if (!pageInfo) return errorResponse(res, 400, "page and limit must be positive integers.");
  if (!ACCOUNT_FILTERS.has(status)) {
    return errorResponse(res, 400, "Invalid account status filter.");
  }
  const search = queryText(req.query.search);
  const values = [role];
  const conditions = ["u.role = $1"];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  if (status === "active" || status === "suspended") {
    values.push(status === "active");
    conditions.push(`u.is_active = $${values.length}`);
  } else if (status !== "all") {
    values.push(status);
    conditions.push(`u.approval_status = $${values.length}`);
  }
  const where = conditions.join(" AND ");
  try {
    const countPromise = pool.query(
      `SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`,
      values,
    );
    const rowsPromise =
      role === "instructor"
        ? pool.query(
            `SELECT u.id, u.full_name, u.email, u.avatar_url, u.bio, u.is_active,
                    u.approval_status, u.approval_reviewed_at,
                    u.approval_reviewed_by, reviewer.full_name AS approval_reviewed_by_name,
                    u.approval_reason, u.created_at, u.updated_at,
                    COUNT(DISTINCT c.id)::int AS course_count,
                    COUNT(DISTINCT e.id)::int AS enrollment_count,
                    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'completed')::int AS completed_enrollments,
                    COALESCE(
                      JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
                        'id', c.id, 'title', c.title, 'status', c.status
                      )) FILTER (WHERE c.id IS NOT NULL),
                      '[]'::json
                    ) AS managed_courses
             FROM users u
             LEFT JOIN courses c ON c.instructor_id = u.id
             LEFT JOIN enrollments e ON e.course_id = c.id
             LEFT JOIN users reviewer ON reviewer.id = u.approval_reviewed_by
             WHERE ${where}
             GROUP BY u.id, reviewer.full_name
             ORDER BY u.created_at DESC, u.id DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, pageInfo.limit, pageInfo.offset],
          )
        : pool.query(
            `WITH lesson_totals AS (
               SELECT m.course_id, COUNT(l.id)::int AS total_lessons
               FROM modules m LEFT JOIN lessons l ON l.module_id = m.id
               GROUP BY m.course_id
             ),
             enrollment_progress AS (
               SELECT e.id, e.student_id, e.course_id, e.status,
                      COUNT(lp.id) FILTER (WHERE lp.completed)::int AS completed_lessons,
                      COALESCE(MAX(lt.total_lessons), 0)::int AS total_lessons
               FROM enrollments e
               LEFT JOIN lesson_totals lt ON lt.course_id = e.course_id
               LEFT JOIN lessons l ON l.module_id IN (
                 SELECT id FROM modules WHERE course_id = e.course_id
               )
               LEFT JOIN lesson_progress lp ON lp.enrollment_id = e.id AND lp.lesson_id = l.id
               GROUP BY e.id
             )
             SELECT u.id, u.full_name, u.email, u.avatar_url, u.bio, u.is_active,
                    u.approval_status, u.approval_reviewed_at,
                    u.approval_reviewed_by, reviewer.full_name AS approval_reviewed_by_name,
                    u.approval_reason, u.created_at, u.updated_at,
                    COUNT(ep.id)::int AS enrollment_count,
                    COUNT(ep.id) FILTER (WHERE ep.status = 'completed')::int AS completed_enrollments,
                    CASE WHEN SUM(ep.total_lessons) > 0
                      THEN ROUND(100.0 * SUM(ep.completed_lessons) / SUM(ep.total_lessons), 1)
                      ELSE 0 END AS average_progress,
                    (SELECT COALESCE(
                       JSON_AGG(JSON_BUILD_OBJECT(
                         'id', c.id, 'title', c.title, 'status', e.status,
                         'enrolled_at', e.created_at, 'completed_at', e.completed_at
                       ) ORDER BY e.created_at DESC),
                       '[]'::json
                     )
                     FROM enrollments e
                     JOIN courses c ON c.id = e.course_id
                     WHERE e.student_id = u.id) AS enrolled_courses
             FROM users u
             LEFT JOIN enrollment_progress ep ON ep.student_id = u.id
             LEFT JOIN users reviewer ON reviewer.id = u.approval_reviewed_by
             WHERE ${where}
             GROUP BY u.id, reviewer.full_name
             ORDER BY u.created_at DESC, u.id DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, pageInfo.limit, pageInfo.offset],
          );
    const [count, rows] = await Promise.all([countPromise, rowsPromise]);
    return sendPage(res, rows.rows, count.rows[0].total, pageInfo.page, pageInfo.limit, "users");
  } catch (error) {
    return next(error);
  }
}

async function getPendingApprovals(req, res, next) {
  const pageInfo = pagination(req.query);
  if (!pageInfo) return errorResponse(res, 400, "page and limit must be positive integers.");
  const search = queryText(req.query.search);
  const values = [];
  let where = "WHERE role IN ('student', 'instructor') AND approval_status = 'pending'";
  if (search) {
    values.push(`%${search}%`);
    where += ` AND (full_name ILIKE $1 OR email ILIKE $1)`;
  }
  try {
    const [count, rows] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, values),
      pool.query(
        `SELECT id, full_name, email, role, avatar_url, bio, is_active,
                approval_status, approval_reviewed_at, approval_reviewed_by,
                approval_reason, created_at
         FROM users
         ${where}
         ORDER BY created_at ASC, id ASC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageInfo.limit, pageInfo.offset],
      ),
    ]);
    return sendPage(res, rows.rows, count.rows[0].total, pageInfo.page, pageInfo.limit, "users");
  } catch (error) {
    return next(error);
  }
}

async function getCourses(req, res, next) {
  const pageInfo = pagination(req.query);
  const status = req.query.status === undefined ? "all" : String(req.query.status);
  if (!pageInfo) return errorResponse(res, 400, "page and limit must be positive integers.");
  if (!COURSE_STATUSES.has(status)) return errorResponse(res, 400, "Invalid course status filter.");
  const values = [];
  const conditions = [];
  const search = queryText(req.query.search);
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(c.title ILIKE $${values.length} OR c.description ILIKE $${values.length})`);
  }
  if (status !== "all") {
    values.push(status);
    conditions.push(`c.status = $${values.length}`);
  }
  const category = queryText(req.query.category);
  if (category) {
    values.push(category);
    conditions.push(`c.category = $${values.length}`);
  }
  const instructorId = req.query.instructor_id;
  if (instructorId !== undefined) {
    if (!/^[1-9]\d*$/.test(String(instructorId))) return errorResponse(res, 400, "instructor_id must be a positive integer.");
    values.push(String(instructorId));
    conditions.push(`c.instructor_id = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const [count, rows] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM courses c ${where}`, values),
      pool.query(
        `SELECT c.id, c.title, c.description, c.category, c.level, c.status,
                c.price, c.published_at, c.created_at, c.updated_at,
                c.instructor_id, u.full_name AS instructor_name,
                COUNT(e.id)::int AS enrollment_count
         FROM courses c
         JOIN users u ON u.id = c.instructor_id
         LEFT JOIN enrollments e ON e.course_id = c.id
         ${where}
         GROUP BY c.id, u.full_name
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageInfo.limit, pageInfo.offset],
      ),
    ]);
    return sendPage(res, rows.rows, count.rows[0].total, pageInfo.page, pageInfo.limit, "courses");
  } catch (error) {
    return next(error);
  }
}

async function getEnrollments(req, res, next) {
  const pageInfo = pagination(req.query);
  const status = req.query.status === undefined ? "all" : String(req.query.status);
  if (!pageInfo) return errorResponse(res, 400, "page and limit must be positive integers.");
  if (!ENROLLMENT_STATUSES.has(status)) return errorResponse(res, 400, "Invalid enrollment status filter.");
  const values = [];
  const conditions = [];
  const search = queryText(req.query.search);
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR c.title ILIKE $${values.length})`);
  }
  if (status !== "all") {
    values.push(status);
    conditions.push(`e.status = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const [count, rows] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total FROM enrollments e
         JOIN users u ON u.id = e.student_id
         JOIN courses c ON c.id = e.course_id ${where}`,
        values,
      ),
      pool.query(
        `WITH course_lessons AS (
           SELECT m.course_id, COUNT(l.id)::int AS total
           FROM modules m LEFT JOIN lessons l ON l.module_id = m.id
           GROUP BY m.course_id
         ),
         progress AS (
           SELECT lp.enrollment_id, COUNT(*) FILTER (WHERE lp.completed)::int AS completed
           FROM lesson_progress lp GROUP BY lp.enrollment_id
         )
         SELECT e.id, e.student_id, u.full_name AS student_name, u.email AS student_email,
                e.course_id, c.title AS course_title, c.instructor_id,
                instructor.full_name AS instructor_name, e.status, e.created_at AS enrolled_at,
                e.completed_at,
                CASE WHEN COALESCE(cl.total, 0) = 0 THEN 0
                  ELSE ROUND(100.0 * COALESCE(p.completed, 0) / cl.total, 1)
                END AS progress_percentage
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
         JOIN courses c ON c.id = e.course_id
         JOIN users instructor ON instructor.id = c.instructor_id
         LEFT JOIN course_lessons cl ON cl.course_id = c.id
         LEFT JOIN progress p ON p.enrollment_id = e.id
         ${where}
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageInfo.limit, pageInfo.offset],
      ),
    ]);
    return sendPage(res, rows.rows, count.rows[0].total, pageInfo.page, pageInfo.limit, "enrollments");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getOverview,
  getAnalytics,
  getPeople,
  getPendingApprovals,
  getCourses,
  getEnrollments,
};
