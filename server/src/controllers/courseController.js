// server/src/controllers/courseController.js

const { pool } = require("../config/db");

const ALLOWED_LEVELS = ["beginner", "intermediate", "advanced", "all_levels"];
const ALLOWED_STATUSES = ["draft", "published", "archived"];

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

function isManager(user) {
  return user.role === "admin" || user.role === "instructor";
}

function canManageCourse(user, course) {
  return (
    user.role === "admin" ||
    (user.role === "instructor" &&
      String(course.instructor_id) === String(user.id))
  );
}

function parsePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(number) || number < 1) {
    return fallback;
  }

  return Math.min(number, max);
}

function validateCourseInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    if (
      typeof body.title !== "string" ||
      body.title.trim().length < 3 ||
      body.title.trim().length > 200
    ) {
      errors.push("Title must contain between 3 and 200 characters.");
    } else {
      data.title = body.title.trim();
    }
  }

  if (!partial || body.description !== undefined) {
    if (
      typeof body.description !== "string" ||
      body.description.trim().length < 10 ||
      body.description.trim().length > 20000
    ) {
      errors.push("Description must contain between 10 and 20,000 characters.");
    } else {
      data.description = body.description.trim();
    }
  }

  if (!partial || body.category !== undefined) {
    if (
      typeof body.category !== "string" ||
      body.category.trim().length < 2 ||
      body.category.trim().length > 100
    ) {
      errors.push("Category must contain between 2 and 100 characters.");
    } else {
      data.category = body.category.trim();
    }
  }

  if (!partial || body.level !== undefined) {
    const level = body.level;

    if (
      typeof level !== "string" ||
      !ALLOWED_LEVELS.includes(level.trim().toLowerCase())
    ) {
      errors.push(`Level must be one of: ${ALLOWED_LEVELS.join(", ")}.`);
    } else {
      data.level = level.trim().toLowerCase();
    }
  }

  if (body.thumbnail_url !== undefined || !partial) {
    const url = body.thumbnail_url;

    if (url === null || url === "") {
      data.thumbnail_url = null;
    } else if (
      typeof url === "string" &&
      url.length <= 2048 &&
      isHttpUrl(url)
    ) {
      data.thumbnail_url = url.trim();
    } else {
      errors.push("Thumbnail must be a valid HTTP or HTTPS URL.");
    }
  }

  if (body.price !== undefined || !partial) {
    const price = body.price === undefined ? 0 : Number(body.price);

    if (!Number.isFinite(price) || price < 0 || price > 100000000) {
      errors.push("Price must be a non-negative number.");
    } else {
      data.price = price;
    }
  }

  if (body.status !== undefined || !partial) {
    const status = body.status === undefined ? "draft" : body.status;

    if (
      typeof status !== "string" ||
      !ALLOWED_STATUSES.includes(status.trim().toLowerCase())
    ) {
      errors.push(`Status must be one of: ${ALLOWED_STATUSES.join(", ")}.`);
    } else {
      data.status = status.trim().toLowerCase();
    }
  }

  return { errors, data };
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function publicCourse(row) {
  return {
    ...row,
    price: Number(row.price),
  };
}

async function generateUniqueSlug(title, excludeCourseId = null) {
  const base = slugify(title) || "course";
  let candidate = base;
  let suffix = 1;

  while (true) {
    const result = excludeCourseId
      ? await pool.query(
          `SELECT id FROM courses
           WHERE slug = $1 AND id <> $2
           LIMIT 1`,
          [candidate, excludeCourseId],
        )
      : await pool.query("SELECT id FROM courses WHERE slug = $1 LIMIT 1", [
          candidate,
        ]);

    if (result.rowCount === 0) return candidate;

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

function buildFilters(query, user) {
  const conditions = [];
  const values = [];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  }

  const search =
    typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";

  if (search) {
    addCondition(
      "(c.title ILIKE ? OR c.description ILIKE ? OR c.category ILIKE ? OR u.full_name ILIKE ?)",
      `%${search}%`,
    );
    const placeholder = `$${values.length}`;
    conditions[conditions.length - 1] =
      `(c.title ILIKE ${placeholder} OR c.description ILIKE ${placeholder} OR c.category ILIKE ${placeholder} OR u.full_name ILIKE ${placeholder})`;
  }

  if (typeof query.category === "string" && query.category.trim()) {
    addCondition("c.category ILIKE ?", query.category.trim().slice(0, 100));
  }

  if (
    typeof query.level === "string" &&
    ALLOWED_LEVELS.includes(query.level.trim().toLowerCase())
  ) {
    addCondition("c.level = ?", query.level.trim().toLowerCase());
  }

  if (user.role === "student") {
    conditions.push("c.status = 'published'");
  } else if (
    query.status &&
    ALLOWED_STATUSES.includes(String(query.status).toLowerCase())
  ) {
    addCondition("c.status = ?", String(query.status).toLowerCase());
  }

  if (user.role === "instructor") {
    addCondition("c.instructor_id = ?", user.id);
  } else if (user.role === "admin" && query.instructor_id) {
    const instructorId = String(query.instructor_id);

    if (/^[1-9]\d*$/.test(instructorId)) {
      addCondition("c.instructor_id = ?", instructorId);
    }
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

async function listCourses(req, res) {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 1000000);
    const limit = parsePositiveInteger(req.query.limit, 12, 50);
    const offset = (page - 1) * limit;

    const sortOptions = {
      newest: "c.created_at DESC",
      oldest: "c.created_at ASC",
      title_asc: "c.title ASC",
      title_desc: "c.title DESC",
      price_asc: "c.price ASC, c.created_at DESC",
      price_desc: "c.price DESC, c.created_at DESC",
    };

    const sort = sortOptions[req.query.sort] || sortOptions.newest;
    const filters = buildFilters(req.query, req.user);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM courses c
       JOIN users u ON u.id = c.instructor_id
       ${filters.where}`,
      filters.values,
    );

    const result = await pool.query(
      `SELECT c.id, c.instructor_id, c.title, c.slug, c.description,
              c.category, c.level, c.thumbnail_url, c.price, c.status,
              c.published_at, c.created_at, c.updated_at,
              u.full_name AS instructor_name, u.avatar_url AS instructor_avatar,
              COUNT(e.id)::int AS enrollment_count
       FROM courses c
       JOIN users u ON u.id = c.instructor_id
       LEFT JOIN enrollments e ON e.course_id = c.id AND e.status IN ('active', 'completed')
       ${filters.where}
       GROUP BY c.id, c.instructor_id, c.title, c.slug, c.description, c.category, 
                c.level, c.thumbnail_url, c.price, c.status, c.published_at, 
                c.created_at, c.updated_at, u.id, u.full_name, u.avatar_url
       ORDER BY ${sort}
       LIMIT $${filters.values.length + 1}
       OFFSET $${filters.values.length + 2}`,
      [...filters.values, limit, offset],
    );

    const total = countResult.rows[0].total;

    return res.status(200).json({
      success: true,
      courses: result.rows.map(publicCourse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List courses error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load courses.",
    });
  }
}

async function getCourseById(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT c.id, c.instructor_id, c.title, c.slug, c.description,
              c.category, c.level, c.thumbnail_url, c.price, c.status,
              c.published_at, c.created_at, c.updated_at,
              u.id AS instructor_id, u.full_name AS instructor_name, 
              u.avatar_url AS instructor_avatar, u.bio AS instructor_bio,
              COUNT(DISTINCT e.id)::int AS enrollment_count,
              COUNT(DISTINCT m.id)::int AS module_count,
              COUNT(DISTINCT l.id)::int AS lesson_count
       FROM courses c
       JOIN users u ON u.id = c.instructor_id
       LEFT JOIN enrollments e ON e.course_id = c.id AND e.status IN ('active', 'completed')
       LEFT JOIN modules m ON m.course_id = c.id
       LEFT JOIN lessons l ON l.module_id = m.id
       WHERE c.id = $1
       GROUP BY c.id, c.instructor_id, c.title, c.slug, c.description, c.category,
                c.level, c.thumbnail_url, c.price, c.status, c.published_at,
                c.created_at, c.updated_at, u.id, u.full_name, u.avatar_url, u.bio
       LIMIT 1`,
      [id],
    );

    const course = result.rows[0];

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    if (course.status !== "published" && !canManageCourse(req.user, course)) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    // Fetch modules and lessons for the course overview
    const modulesResult = await pool.query(
      `SELECT m.id, m.title, m.description, m.position,
              COUNT(l.id)::int AS lesson_count
       FROM modules m
       LEFT JOIN lessons l ON l.module_id = m.id
       WHERE m.course_id = $1
       GROUP BY m.id, m.title, m.description, m.position
       ORDER BY m.position`,
      [id],
    );

    return res.status(200).json({
      success: true,
      course: {
        ...publicCourse(course),
        instructor: {
          id: course.instructor_id,
          name: course.instructor_name,
          avatar: course.instructor_avatar,
          bio: course.instructor_bio,
        },
        stats: {
          enrollmentCount: course.enrollment_count,
          moduleCount: course.module_count,
          lessonCount: course.lesson_count,
        },
        modules: modulesResult.rows,
      },
    });
  } catch (error) {
    console.error("Get course error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load the course.",
    });
  }
}

async function createCourse(req, res) {
  try {
    if (!isManager(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only instructors and administrators can create courses.",
      });
    }

    const { errors, data } = validateCourseInput(req.body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Please correct the course information.",
        errors,
      });
    }

    const slug = await generateUniqueSlug(data.title);
    const instructorId = req.user.id;

    // Instructors can publish their own course; admins can also create courses.
    const publishedAt = data.status === "published" ? new Date() : null;

    const result = await pool.query(
      `INSERT INTO courses
         (instructor_id, title, slug, description, category, level,
          thumbnail_url, price, status, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, instructor_id, title, slug, description, category,
                 level, thumbnail_url, price, status, published_at,
                 created_at, updated_at`,
      [
        instructorId,
        data.title,
        slug,
        data.description,
        data.category,
        data.level,
        data.thumbnail_url,
        data.price,
        data.status,
        publishedAt,
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Course created successfully.",
      course: publicCourse(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "A course with this slug already exists. Try a different title.",
      });
    }

    console.error("Create course error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create the course.",
    });
  }
}

async function updateCourse(req, res) {
  try {
    const { id } = req.params;
    const found = await pool.query(
      "SELECT id, instructor_id, status FROM courses WHERE id = $1",
      [id],
    );

    const existing = found.rows[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    if (!canManageCourse(req.user, existing)) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own courses.",
      });
    }

    const { errors, data } = validateCourseInput(req.body, { partial: true });

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Please correct the course information.",
        errors,
      });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update.",
      });
    }

    const fields = [];
    const values = [];

    function setField(column, value) {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    }

    if (data.title !== undefined) {
      setField("title", data.title);
      setField("slug", await generateUniqueSlug(data.title, id));
    }

    for (const field of [
      "description",
      "category",
      "level",
      "thumbnail_url",
      "price",
      "status",
    ]) {
      if (data[field] !== undefined) setField(field, data[field]);
    }

    if (data.status !== undefined) {
      if (data.status === "published") {
        fields.push("published_at = COALESCE(published_at, NOW())");
      } else {
        fields.push("published_at = NULL");
      }
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const result = await pool.query(
      `UPDATE courses
       SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING id, instructor_id, title, slug, description, category,
                 level, thumbnail_url, price, status, published_at,
                 created_at, updated_at`,
      values,
    );

    return res.status(200).json({
      success: true,
      message: "Course updated successfully.",
      course: publicCourse(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "That course slug already exists.",
      });
    }

    console.error("Update course error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update the course.",
    });
  }
}

async function deleteCourse(req, res) {
  try {
    const { id } = req.params;

    const found = await pool.query(
      "SELECT id, instructor_id FROM courses WHERE id = $1",
      [id],
    );

    const course = found.rows[0];

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    if (!canManageCourse(req.user, course)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own courses.",
      });
    }

    // The database schema intentionally restricts deletion when enrollments
    // reference a course. Archive such courses instead.
    await pool.query("DELETE FROM courses WHERE id = $1", [id]);

    return res.status(200).json({
      success: true,
      message: "Course deleted successfully.",
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "This course has related learning records. Archive it instead of deleting it.",
      });
    }

    console.error("Delete course error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to delete the course.",
    });
  }
}

async function listCategories(req, res) {
  try {
    // Get all unique categories with course counts (published courses visible to students)
    const result = await pool.query(
      `SELECT DISTINCT c.category, COUNT(*)::int AS course_count
       FROM courses c
       WHERE c.status = 'published'
       AND c.category IS NOT NULL
       AND c.category != ''
       GROUP BY c.category
       ORDER BY c.category ASC`,
    );

    return res.status(200).json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    console.error("List categories error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load categories.",
    });
  }
}

async function getCategories(req, res) {
  try {
    const user = req.user;
    const courseFilter =
      user.role === "student"
        ? "AND c.status = 'published'"
        : user.role === "instructor"
          ? "AND c.instructor_id = $1"
          : "";
    const values = user.role === "instructor" ? [user.id] : [];
    const result = await pool.query(
      `WITH category_names AS (
         SELECT LOWER(BTRIM(name)) AS category_key, MIN(BTRIM(name)) AS category
         FROM (
           SELECT name FROM course_categories
           UNION ALL
           SELECT category FROM courses
         ) names
         WHERE name IS NOT NULL AND BTRIM(name) <> ''
         GROUP BY LOWER(BTRIM(name))
       )
       SELECT names.category, COUNT(c.id)::int AS course_count
       FROM category_names names
       LEFT JOIN courses c
         ON LOWER(BTRIM(c.category)) = names.category_key
         ${courseFilter}
       ${user.role === "student" ? "WHERE c.id IS NOT NULL" : ""}
       GROUP BY names.category_key, names.category
       ORDER BY names.category ASC`,
      values,
    );

    return res.status(200).json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    console.error("Get categories error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load categories.",
    });
  }
}

async function createCategory(req, res) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Category name must contain between 2 and 100 characters.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO course_categories (name)
       VALUES ($1)
       RETURNING name`,
      [name],
    );

    return res.status(201).json({
      success: true,
      category: { name: result.rows[0].name, course_count: 0 },
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A category with this name already exists.",
      });
    }

    console.error("Create category error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create category.",
    });
  }
}

module.exports = {
  listCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  listCategories,
  getCategories,
  createCategory,
};
