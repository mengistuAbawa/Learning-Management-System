const { pool } = require("../config/db");

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

function getUserId(req) {
  return req.user?.id;
}

function isManagerForCourse(user, course) {
  return (
    user?.role === "admin" ||
    (user?.role === "instructor" &&
      String(user.id) === String(course.instructor_id))
  );
}

// POST /api/enrollments/courses/:courseId
async function enrollInCourse(req, res, next) {
  const { courseId } = req.params;
  const studentId = getUserId(req);

  if (!validId(courseId)) {
    return errorResponse(res, 400, "Invalid course ID.");
  }

  if (req.user?.role !== "student") {
    return errorResponse(res, 403, "Only students can enroll in courses.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const courseResult = await client.query(
      `SELECT id, title, status
       FROM courses
       WHERE id = $1
       FOR SHARE`,
      [courseId],
    );

    const course = courseResult.rows[0];

    if (!course) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Course not found.");
    }

    if (course.status !== "published") {
      await client.query("ROLLBACK");
      return errorResponse(
        res,
        400,
        "You can enroll only in published courses.",
      );
    }

    const result = await client.query(
      `INSERT INTO enrollments (student_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (student_id, course_id)
       DO UPDATE SET
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
       WHERE enrollments.status = 'cancelled'
       RETURNING id, student_id, course_id, status,
                 created_at, updated_at`,
      [studentId, courseId],
    );

    if (result.rowCount === 0) {
      const existing = await client.query(
        `SELECT id, student_id, course_id, status,
                created_at, updated_at
         FROM enrollments
         WHERE student_id = $1 AND course_id = $2`,
        [studentId, courseId],
      );

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "You are already enrolled in this course.",
        data: existing.rows[0],
      });
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Successfully enrolled in the course.",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

async function enrollStudentAsAdmin(req, res, next) {
  const { courseId } = req.params;
  const email =
    typeof req.body.student_email === "string"
      ? req.body.student_email.trim().toLowerCase()
      : "";

  if (!validId(courseId)) {
    return errorResponse(res, 400, "Invalid course ID.");
  }

  if (req.user?.role !== "admin") {
    return errorResponse(res, 403, "Only administrators can enroll another student.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return errorResponse(res, 400, "Enter a valid student email address.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const courseResult = await client.query(
      `SELECT id, title, status
       FROM courses
       WHERE id = $1
       FOR SHARE`,
      [courseId],
    );
    const course = courseResult.rows[0];

    if (!course) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Course not found.");
    }

    if (course.status !== "published") {
      await client.query("ROLLBACK");
      return errorResponse(res, 400, "Students can enroll only in published courses.");
    }

    const studentResult = await client.query(
      `SELECT id, full_name, email, is_active, approval_status
       FROM users
       WHERE LOWER(email) = $1 AND role = 'student'
       FOR SHARE`,
      [email],
    );
    const student = studentResult.rows[0];

    if (!student) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Approved student account not found.");
    }

    if (!student.is_active || student.approval_status !== "approved") {
      await client.query("ROLLBACK");
      return errorResponse(
        res,
        403,
        "Only approved, active students can be enrolled.",
      );
    }

    const enrollmentResult = await client.query(
      `INSERT INTO enrollments (student_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (student_id, course_id)
       DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE enrollments.status = 'cancelled'
       RETURNING id, student_id, course_id, status, created_at, updated_at`,
      [student.id, courseId],
    );

    if (!enrollmentResult.rowCount) {
      await client.query("ROLLBACK");
      return errorResponse(res, 409, "This student is already enrolled in the course.");
    }

    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, link_url)
       VALUES ($1, 'enrollment_approved', 'Course enrollment', $2, $3)`,
      [
        student.id,
        `An administrator enrolled you in "${course.title}".`,
        `/courses/${courseId}/learn`,
      ],
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Student enrolled successfully.",
      data: {
        ...enrollmentResult.rows[0],
        student_name: student.full_name,
        student_email: student.email,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

// GET /api/enrollments/my
async function getMyEnrollments(req, res, next) {
  if (req.user?.role !== "student") {
    return errorResponse(res, 403, "This endpoint is for students.");
  }

  try {
    const result = await pool.query(
      `SELECT
         e.id AS enrollment_id,
         e.status AS enrollment_status,
         e.created_at AS enrolled_at,
         c.id AS course_id,
         c.title,
         c.slug,
         c.description,
         c.category,
         c.level,
         c.thumbnail_url,
         c.instructor_id,
         u.full_name AS instructor_name,
         COUNT(l.id)::int AS total_lessons,
         COUNT(l.id) FILTER (WHERE lp.completed = TRUE)::int
           AS completed_lessons,
         CASE
           WHEN COUNT(l.id) = 0 THEN 0
           ELSE ROUND(
             100.0 * COUNT(l.id) FILTER (WHERE lp.completed = TRUE)
             / COUNT(l.id)
           )::int
         END AS completion_percentage
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN users u ON u.id = c.instructor_id
       LEFT JOIN modules m ON m.course_id = c.id
       LEFT JOIN lessons l ON l.module_id = m.id
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.id AND lp.enrollment_id = e.id
       WHERE e.student_id = $1
       GROUP BY e.id, e.status, e.created_at, c.id, c.title, c.slug, c.description, c.category, c.level, c.thumbnail_url, c.instructor_id, u.id, u.full_name
       ORDER BY e.created_at DESC`,
      [getUserId(req)],
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

// GET /api/enrollments/courses/:courseId
// Students see only their own enrollment; course managers can see all.
async function getCourseEnrollments(req, res, next) {
  const { courseId } = req.params;

  if (!validId(courseId)) {
    return errorResponse(res, 400, "Invalid course ID.");
  }

  try {
    const courseResult = await pool.query(
      `SELECT id, instructor_id, title
       FROM courses WHERE id = $1`,
      [courseId],
    );

    const course = courseResult.rows[0];

    if (!course) {
      return errorResponse(res, 404, "Course not found.");
    }

    const manager = isManagerForCourse(req.user, course);

    if (!manager && req.user?.role !== "student") {
      return errorResponse(res, 403, "You cannot view these enrollments.");
    }

    const params = [courseId];
    let studentFilter = "";

    if (!manager) {
      params.push(getUserId(req));
      studentFilter = "AND e.student_id = $2";
    }

    const result = await pool.query(
      `SELECT
         e.id, e.student_id, e.course_id, e.status,
         e.created_at, e.updated_at,
         u.full_name AS student_name,
         u.email AS student_email,
         COUNT(l.id)::int AS total_lessons,
         COUNT(l.id) FILTER (WHERE lp.completed = TRUE)::int
           AS completed_lessons,
         CASE
           WHEN COUNT(l.id) = 0 THEN 0
           ELSE ROUND(
             100.0 * COUNT(l.id) FILTER (WHERE lp.completed = TRUE)
             / COUNT(l.id)
           )::int
         END AS completion_percentage
       FROM enrollments e
       JOIN users u ON u.id = e.student_id
       LEFT JOIN modules m ON m.course_id = e.course_id
       LEFT JOIN lessons l ON l.module_id = m.id
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.id AND lp.enrollment_id = e.id
       WHERE e.course_id = $1 ${studentFilter}
       GROUP BY e.id, e.student_id, e.course_id, e.status, e.created_at, e.updated_at, u.id, u.full_name, u.email
       ORDER BY e.created_at DESC`,
      params,
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/enrollments/:id/status
// Students may cancel their own enrollment.
// Course managers may activate or cancel enrollments for their course.
async function updateEnrollmentStatus(req, res, next) {
  const { id } = req.params;
  const { status } = req.body;

  if (!validId(id)) {
    return errorResponse(res, 400, "Invalid enrollment ID.");
  }

  if (!["active", "cancelled"].includes(status)) {
    return errorResponse(
      res,
      400,
      "Status must be active or cancelled. Completion is calculated automatically.",
    );
  }

  try {
    const result = await pool.query(
      `SELECT e.id, e.student_id, e.course_id, e.status,
              c.instructor_id
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.id = $1`,
      [id],
    );

    const enrollment = result.rows[0];

    if (!enrollment) {
      return errorResponse(res, 404, "Enrollment not found.");
    }

    const manager = isManagerForCourse(req.user, enrollment);

    const isOwnStudentEnrollment =
      req.user?.role === "student" &&
      String(req.user.id) === String(enrollment.student_id) &&
      status === "cancelled";

    if (!manager && !isOwnStudentEnrollment) {
      return errorResponse(res, 403, "You cannot update this enrollment.");
    }

    const course = await pool.query(
      `SELECT status FROM courses WHERE id = $1`,
      [enrollment.course_id],
    );

    if (status === "active" && course.rows[0]?.status !== "published") {
      return errorResponse(
        res,
        400,
        "Only enrollments in published courses can be activated.",
      );
    }

    // Do not permit manual reactivation of a course already completed.
    if (enrollment.status === "completed" && status === "active") {
      return errorResponse(
        res,
        409,
        "A completed enrollment cannot be reactivated manually.",
      );
    }

    const updated = await pool.query(
      `UPDATE enrollments
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, student_id, course_id, status,
                 created_at, updated_at`,
      [status, id],
    );

    return res.json({
      success: true,
      message: "Enrollment status updated.",
      data: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  enrollInCourse,
  enrollStudentAsAdmin,
  getMyEnrollments,
  getCourseEnrollments,
  updateEnrollmentStatus,
};
