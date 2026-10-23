const { pool } = require("../config/db");

async function getCourse(courseId) {
  const result = await pool.query(
    `SELECT id, instructor_id, title, status
     FROM courses
     WHERE id = $1
     LIMIT 1`,
    [courseId]
  );

  return result.rows[0] || null;
}

function ownsCourse(user, course) {
  return (
    user.role === "admin" ||
    (
      user.role === "instructor" &&
      String(user.id) === String(course.instructor_id)
    )
  );
}

async function isEnrolled(userId, courseId) {
  const result = await pool.query(
    `SELECT 1
     FROM enrollments
     WHERE student_id = $1
       AND course_id = $2
       AND status IN ('active', 'completed')
     LIMIT 1`,
    [userId, courseId]
  );

  return result.rowCount > 0;
}

async function checkCourseAccess(user, courseId) {
  const course = await getCourse(courseId);

  if (!course) {
    return { allowed: false, course: null, reason: "not_found" };
  }

  if (ownsCourse(user, course)) {
    return { allowed: true, course, manager: true, enrolled: false };
  }

  if (user.role === "student" && course.status === "published") {
    const enrolled = await isEnrolled(user.id, course.id);

    return {
      allowed: true,
      course,
      manager: false,
      enrolled,
    };
  }

  return { allowed: false, course, reason: "forbidden" };
}

async function checkModuleAccess(user, moduleId) {
  const result = await pool.query(
    `SELECT m.id, m.course_id, m.title, m.description, m.position,
            c.instructor_id, c.status AS course_status
     FROM modules m
     JOIN courses c ON c.id = m.course_id
     WHERE m.id = $1
     LIMIT 1`,
    [moduleId]
  );

  const module = result.rows[0];

  if (!module) {
    return { allowed: false, module: null, reason: "not_found" };
  }

  const access = await checkCourseAccess(user, module.course_id);

  if (!access.allowed) {
    return {
      allowed: false,
      module,
      reason: access.reason,
    };
  }

  return {
    ...access,
    module,
  };
}

module.exports = {
  getCourse,
  ownsCourse,
  isEnrolled,
  checkCourseAccess,
  checkModuleAccess,
};