const { pool } = require("../config/db");
const { getCourse, ownsCourse, isEnrolled } = require("../services/courseAccess");

const validId = (value) => /^[1-9]\d*$/.test(String(value));

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function canManageQuiz(user, quizId) {
  const result = await pool.query(
    `SELECT q.*, c.instructor_id
     FROM quizzes q
     JOIN courses c ON c.id = q.course_id
     WHERE q.id = $1`,
    [quizId]
  );

  const quiz = result.rows[0];
  if (!quiz) return { quiz: null, allowed: false };

  return {
    quiz,
    allowed: ownsCourse(user, { instructor_id: quiz.instructor_id }),
  };
}

async function listQuizzes(req, res, next) {
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
      return fail(res, 403, "Enroll in this course to view its quizzes.");
    }

    const result = await pool.query(
      `SELECT q.id, q.course_id, q.title, q.description,
              q.time_limit_minutes, q.passing_score, q.max_attempts,
              q.is_published, q.created_at,
              COUNT(DISTINCT qq.id)::int AS question_count
       FROM quizzes q
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       WHERE q.course_id = $1
         AND ($2::boolean = TRUE OR q.is_published = TRUE)
       GROUP BY q.id
       ORDER BY q.created_at DESC`,
      [courseId, manager]
    );

    return res.json({ success: true, quizzes: result.rows });
  } catch (error) {
    next(error);
  }
}

async function createQuiz(req, res, next) {
  try {
    const { courseId } = req.params;
    const {
      title,
      description = "",
      time_limit_minutes = 30,
      passing_score = 50,
      max_attempts = 3,
      is_published = false,
    } = req.body;

    if (!validId(courseId)) return fail(res, 400, "Invalid course ID.");
    if (typeof title !== "string" || title.trim().length < 2 ||
        title.trim().length > 200) {
      return fail(res, 400, "Title must contain 2–200 characters.");
    }

    const limit = Number(time_limit_minutes);
    const pass = Number(passing_score);
    const attempts = Number(max_attempts);

    if (!Number.isInteger(limit) || limit < 1 || limit > 600) {
      return fail(res, 400, "Time limit must be between 1 and 600 minutes.");
    }
    if (!Number.isFinite(pass) || pass < 0 || pass > 100) {
      return fail(res, 400, "Passing score must be between 0 and 100.");
    }
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) {
      return fail(res, 400, "Maximum attempts must be between 1 and 20.");
    }
    if (typeof is_published !== "boolean") {
      return fail(res, 400, "is_published must be true or false.");
    }

    const course = await getCourse(courseId);
    if (!course) return fail(res, 404, "Course not found.");
    if (!ownsCourse(req.user, course)) {
      return fail(res, 403, "Only the course instructor or admin can create quizzes.");
    }

    const result = await pool.query(
      `INSERT INTO quizzes
         (course_id, title, description, time_limit_minutes,
          passing_score, max_attempts, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        courseId, title.trim(), String(description).slice(0, 10000),
        limit, pass, attempts, is_published,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Quiz created.",
      quiz: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

async function addQuestion(req, res, next) {
  const client = await pool.connect();

  try {
    const { quizId } = req.params;
    const { question_text, points = 1, options } = req.body;

    if (!validId(quizId)) return fail(res, 400, "Invalid quiz ID.");
    if (typeof question_text !== "string" ||
        question_text.trim().length < 3 ||
        question_text.trim().length > 5000) {
      return fail(res, 400, "Question text must contain 3–5000 characters.");
    }

    const pointValue = Number(points);
    if (!Number.isFinite(pointValue) || pointValue <= 0 || pointValue > 10000) {
      return fail(res, 400, "Question points must be greater than 0 and at most 10000.");
    }

    if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
      return fail(res, 400, "Provide between 2 and 10 answer options.");
    }

    const correctCount = options.filter((option) => option.is_correct === true).length;

    if (correctCount !== 1 ||
        options.some((option) =>
          typeof option.text !== "string" ||
          option.text.trim().length === 0 ||
          option.text.length > 1000 ||
          typeof option.is_correct !== "boolean"
        )) {
      return fail(res, 400, "Provide valid options and exactly one correct answer.");
    }

    const access = await canManageQuiz(req.user, quizId);
    if (!access.quiz) return fail(res, 404, "Quiz not found.");
    if (!access.allowed) return fail(res, 403, "You cannot edit this quiz.");

    await client.query("BEGIN");

    const positionResult = await client.query(
      "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM quiz_questions WHERE quiz_id = $1",
      [quizId]
    );

    const questionResult = await client.query(
      `INSERT INTO quiz_questions (quiz_id, question_text, points, position)
       VALUES ($1, $2, $3, $4)
       RETURNING id, quiz_id, question_text, points, position`,
      [quizId, question_text.trim(), pointValue, positionResult.rows[0].position]
    );

    const question = questionResult.rows[0];
    const savedOptions = [];

    for (let index = 0; index < options.length; index += 1) {
      const optionResult = await client.query(
        `INSERT INTO quiz_options
           (question_id, option_text, is_correct, position)
         VALUES ($1, $2, $3, $4)
         RETURNING id, question_id, option_text, is_correct, position`,
        [
          question.id,
          options[index].text.trim(),
          options[index].is_correct,
          index + 1,
        ]
      );
      savedOptions.push(optionResult.rows[0]);
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      question: { ...question, options: savedOptions },
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(error);
  } finally {
    client.release();
  }
}

async function getQuiz(req, res, next) {
  try {
    const { quizId } = req.params;
    if (!validId(quizId)) return fail(res, 400, "Invalid quiz ID.");

    const access = await canManageQuiz(req.user, quizId);
    if (!access.quiz) return fail(res, 404, "Quiz not found.");

    const manager = access.allowed;
    const enrolled = req.user.role === "student"
      ? await isEnrolled(req.user.id, access.quiz.course_id)
      : false;

    if (!manager && (!enrolled || !access.quiz.is_published)) {
      return fail(res, 403, "This quiz is not available to you.");
    }

    const questions = await pool.query(
      `SELECT id, quiz_id, question_text, points, position
       FROM quiz_questions
       WHERE quiz_id = $1
       ORDER BY position`,
      [quizId]
    );

    const questionIds = questions.rows.map((question) => question.id);
    let options = [];

    if (questionIds.length) {
      const optionResult = await pool.query(
        `SELECT id, question_id, option_text, position
         ${manager ? ", is_correct" : ""}
         FROM quiz_options
         WHERE question_id = ANY($1::bigint[])
         ORDER BY position`,
        [questionIds]
      );
      options = optionResult.rows;
    }

    const resultQuestions = questions.rows.map((question) => ({
      ...question,
      options: options.filter(
        (option) => String(option.question_id) === String(question.id)
      ),
    }));

    return res.json({
      success: true,
      quiz: {
        id: access.quiz.id,
        course_id: access.quiz.course_id,
        title: access.quiz.title,
        description: access.quiz.description,
        time_limit_minutes: access.quiz.time_limit_minutes,
        passing_score: access.quiz.passing_score,
        max_attempts: access.quiz.max_attempts,
        is_published: access.quiz.is_published,
        questions: resultQuestions,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function startAttempt(req, res, next) {
  try {
    const { quizId } = req.params;

    if (req.user.role !== "student") {
      return fail(res, 403, "Only students can take quizzes.");
    }
    if (!validId(quizId)) return fail(res, 400, "Invalid quiz ID.");

    const quizResult = await pool.query(
      "SELECT * FROM quizzes WHERE id = $1 AND is_published = TRUE",
      [quizId]
    );
    const quiz = quizResult.rows[0];

    if (!quiz) return fail(res, 404, "Published quiz not found.");

    if (!(await isEnrolled(req.user.id, quiz.course_id))) {
      return fail(res, 403, "You must enroll in this course first.");
    }

    const existing = await pool.query(
      `SELECT id, started_at
       FROM quiz_attempts
       WHERE quiz_id = $1 AND student_id = $2 AND status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1`,
      [quizId, req.user.id]
    );

    if (existing.rowCount) {
      const attempt = existing.rows[0];
      const deadline = new Date(attempt.started_at).getTime() +
        Number(quiz.time_limit_minutes) * 60 * 1000;

      if (Date.now() < deadline) {
        return res.json({
          success: true,
          attempt,
          deadline: new Date(deadline).toISOString(),
          resumed: true,
        });
      }

      await pool.query(
        `UPDATE quiz_attempts
         SET status = 'expired', submitted_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [attempt.id]
      );
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM quiz_attempts
       WHERE quiz_id = $1 AND student_id = $2`,
      [quizId, req.user.id]
    );

    if (countResult.rows[0].count >= quiz.max_attempts) {
      return fail(res, 409, "You have reached the maximum number of attempts.");
    }

    const attemptNumber = countResult.rows[0].count + 1;

    const result = await pool.query(
      `INSERT INTO quiz_attempts
         (quiz_id, student_id, attempt_number, status)
       VALUES ($1, $2, $3, 'in_progress')
       RETURNING id, quiz_id, student_id, attempt_number, started_at, status`,
      [quizId, req.user.id, attemptNumber]
    );

    const attempt = result.rows[0];

    return res.status(201).json({
      success: true,
      attempt,
      deadline: new Date(
        new Date(attempt.started_at).getTime() +
        Number(quiz.time_limit_minutes) * 60 * 1000
      ).toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

async function submitAttempt(req, res, next) {
  const client = await pool.connect();

  try {
    const { attemptId } = req.params;
    const { answers } = req.body;

    if (req.user.role !== "student") {
      return fail(res, 403, "Only students can submit quiz attempts.");
    }
    if (!validId(attemptId)) return fail(res, 400, "Invalid attempt ID.");
    if (!Array.isArray(answers)) return fail(res, 400, "Answers must be an array.");

    await client.query("BEGIN");

    const attemptResult = await client.query(
      `SELECT a.*, q.time_limit_minutes, q.passing_score
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.id = $1 AND a.student_id = $2
       FOR UPDATE`,
      [attemptId, req.user.id]
    );

    const attempt = attemptResult.rows[0];

    if (!attempt) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Quiz attempt not found.");
    }

    if (attempt.status !== "in_progress") {
      await client.query("ROLLBACK");
      return fail(res, 409, "This attempt has already been submitted or expired.");
    }

    const deadline = new Date(attempt.started_at).getTime() +
      Number(attempt.time_limit_minutes) * 60 * 1000;

    if (Date.now() > deadline) {
      await client.query(
        `UPDATE quiz_attempts
         SET status = 'expired', submitted_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [attemptId]
      );
      await client.query("COMMIT");
      return fail(res, 409, "The quiz time limit has expired.");
    }

    const questionResult = await client.query(
      "SELECT id, points FROM quiz_questions WHERE quiz_id = $1",
      [attempt.quiz_id]
    );

    const questionMap = new Map(
      questionResult.rows.map((question) => [
        String(question.id),
        Number(question.points),
      ])
    );

    const submitted = new Map();

    for (const answer of answers) {
      if (!validId(answer.question_id) ||
          (answer.option_id != null && !validId(answer.option_id))) {
        await client.query("ROLLBACK");
        return fail(res, 400, "An answer contains an invalid ID.");
      }

      if (!questionMap.has(String(answer.question_id)) ||
          submitted.has(String(answer.question_id))) {
        await client.query("ROLLBACK");
        return fail(res, 400, "An answer references an invalid or duplicate question.");
      }

      submitted.set(String(answer.question_id), answer.option_id);
    }

    let score = 0;
    const totalPoints = questionResult.rows.reduce(
      (sum, question) => sum + Number(question.points),
      0
    );

    for (const question of questionResult.rows) {
      const optionId = submitted.get(String(question.id));

      if (optionId == null) continue;

      const correctOption = await client.query(
        `SELECT id FROM quiz_options
         WHERE id = $1 AND question_id = $2 AND is_correct = TRUE`,
        [optionId, question.id]
      );

      if (correctOption.rowCount) score += Number(question.points);
    }

    // Replace any existing answers for this attempt.
    await client.query(
      "DELETE FROM quiz_answers WHERE attempt_id = $1",
      [attemptId]
    );

    for (const [questionId, optionId] of submitted.entries()) {
      if (optionId == null) continue;

      // Verify the selected option belongs to the same question.
      const validOption = await client.query(
        "SELECT id FROM quiz_options WHERE id = $1 AND question_id = $2",
        [optionId, questionId]
      );

      if (!validOption.rowCount) {
        await client.query("ROLLBACK");
        return fail(res, 400, "Selected option does not belong to its question.");
      }

      await client.query(
        `INSERT INTO quiz_answers (attempt_id, question_id, option_id)
         VALUES ($1, $2, $3)`,
        [attemptId, questionId, optionId]
      );
    }

    const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
    const passed = totalPoints > 0 &&
      percentage >= Number(attempt.passing_score);

    const updated = await client.query(
      `UPDATE quiz_attempts
       SET score = $1, total_points = $2, passed = $3,
           status = 'submitted', submitted_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, quiz_id, attempt_number, score,
                 total_points, passed, status, submitted_at`,
      [score, totalPoints, passed, attemptId]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Quiz submitted and graded.",
      result: {
        ...updated.rows[0],
        percentage: Number(percentage.toFixed(2)),
      },
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(error);
  } finally {
    client.release();
  }
}

async function getMyAttempts(req, res, next) {
  try {
    if (req.user.role !== "student") {
      return fail(res, 403, "Only students can view their attempt history.");
    }

    const result = await pool.query(
      `SELECT a.id AS attempt_id, a.quiz_id, q.title AS quiz_title,
              a.attempt_number, a.started_at, a.submitted_at,
              a.score, a.total_points, a.passed, a.status,
              CASE WHEN a.total_points > 0
                THEN ROUND(100.0 * a.score / a.total_points, 2)
                ELSE 0 END AS percentage
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.student_id = $1
       ORDER BY a.started_at DESC`,
      [req.user.id]
    );

    return res.json({ success: true, attempts: result.rows });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listQuizzes,
  createQuiz,
  addQuestion,
  getQuiz,
  startAttempt,
  submitAttempt,
  getMyAttempts,
};