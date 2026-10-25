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
      instructions = "",
      time_limit_minutes = 30,
      passing_score = 50,
      max_attempts = 3,
      is_published = false,
      opens_at = null,
      closes_at = null,
      shuffle_questions = false,
      shuffle_options = false,
      show_results_immediately = true,
      allow_answer_review = true,
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
    if (
      [shuffle_questions, shuffle_options, show_results_immediately, allow_answer_review]
        .some((value) => typeof value !== "boolean")
    ) {
      return fail(res, 400, "Assessment settings must be true or false.");
    }
    if (
      typeof instructions !== "string" ||
      instructions.length > 10000 ||
      (opens_at !== null && !Number.isFinite(Date.parse(opens_at))) ||
      (closes_at !== null && !Number.isFinite(Date.parse(closes_at))) ||
      (opens_at && closes_at && Date.parse(opens_at) >= Date.parse(closes_at))
    ) {
      return fail(res, 400, "Instructions or availability dates are invalid.");
    }

    const course = await getCourse(courseId);
    if (!course) return fail(res, 404, "Course not found.");
    if (!ownsCourse(req.user, course)) {
      return fail(res, 403, "Only the course instructor or admin can create quizzes.");
    }

    const result = await pool.query(
      `INSERT INTO quizzes
         (course_id, title, description, time_limit_minutes,
          passing_score, max_attempts, is_published, instructions,
          opens_at, closes_at, shuffle_questions, shuffle_options,
          show_results_immediately, allow_answer_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        courseId, title.trim(), String(description).slice(0, 10000),
        limit, pass, attempts, is_published, instructions.trim(),
        opens_at, closes_at, shuffle_questions, shuffle_options,
        show_results_immediately, allow_answer_review,
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
    const {
      question_text,
      question_type = "single_choice",
      points = 1,
      options = [],
      accepted_answers = [],
    } = req.body;

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

    const supportedTypes = [
      "single_choice",
      "multiple_choice",
      "true_false",
      "short_answer",
      "essay",
    ];
    if (!supportedTypes.includes(question_type)) {
      return fail(res, 400, "Unsupported question type.");
    }

    if (!Array.isArray(options) || options.length > 10) {
      return fail(res, 400, "Provide no more than 10 answer options.");
    }
    if (!Array.isArray(accepted_answers) ||
        accepted_answers.some((answer) => typeof answer !== "string" || !answer.trim() || answer.length > 500)) {
      return fail(res, 400, "Accepted answers must be non-empty text values.");
    }
    const choiceQuestion = ["single_choice", "multiple_choice", "true_false"].includes(question_type);
    const correctCount = options.filter((option) => option.is_correct === true).length;

    if (
        (choiceQuestion && (options.length < 2 || correctCount < 1)) ||
        (question_type === "single_choice" && correctCount !== 1) ||
        (question_type === "true_false" && (options.length !== 2 || correctCount !== 1)) ||
        (question_type === "short_answer" && accepted_answers.length === 0) ||
        options.some((option) =>
          typeof option.text !== "string" ||
          option.text.trim().length === 0 ||
          option.text.length > 1000 ||
          typeof option.is_correct !== "boolean"
        )) {
      return fail(res, 400, "Question options or accepted answers do not match its type.");
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
      `INSERT INTO quiz_questions
         (quiz_id, question_text, question_type, points, position, accepted_answers)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, quiz_id, question_text, points, position`,
      [
        quizId,
        question_text.trim(),
        question_type,
        pointValue,
        positionResult.rows[0].position,
        accepted_answers.map((answer) => answer.trim()),
      ]
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
    const now = Date.now();
    if (
      !manager &&
      ((access.quiz.opens_at && now < new Date(access.quiz.opens_at).getTime()) ||
        (access.quiz.closes_at && now >= new Date(access.quiz.closes_at).getTime()))
    ) {
      return fail(res, 403, "This assessment is outside its availability window.");
    }

    const questions = await pool.query(
      `SELECT id, quiz_id, question_text, question_type, points, position
              ${manager ? ", accepted_answers" : ""}
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
        instructions: access.quiz.instructions,
        opens_at: access.quiz.opens_at,
        closes_at: access.quiz.closes_at,
        shuffle_questions: access.quiz.shuffle_questions,
        shuffle_options: access.quiz.shuffle_options,
        show_results_immediately: access.quiz.show_results_immediately,
        allow_answer_review: access.quiz.allow_answer_review,
        questions: resultQuestions,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function startAttempt(req, res, next) {
  const client = await pool.connect();
  try {
    const { quizId } = req.params;

    if (req.user.role !== "student") {
      return fail(res, 403, "Only students can take quizzes.");
    }
    if (!validId(quizId)) return fail(res, 400, "Invalid quiz ID.");

    await client.query("BEGIN");
    const quizResult = await client.query(
      `SELECT * FROM quizzes
       WHERE id = $1 AND is_published = TRUE AND archived_at IS NULL
       FOR UPDATE`,
      [quizId]
    );
    const quiz = quizResult.rows[0];

    if (!quiz) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Published quiz not found.");
    }

    const now = Date.now();
    if (
      (quiz.opens_at && now < new Date(quiz.opens_at).getTime()) ||
      (quiz.closes_at && now >= new Date(quiz.closes_at).getTime())
    ) {
      await client.query("ROLLBACK");
      return fail(res, 403, "This assessment is outside its availability window.");
    }

    if (!(await isEnrolled(req.user.id, quiz.course_id))) {
      await client.query("ROLLBACK");
      return fail(res, 403, "You must enroll in this course first.");
    }

    const existing = await client.query(
      `SELECT id, started_at
       FROM quiz_attempts
       WHERE quiz_id = $1 AND student_id = $2 AND status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1
       FOR UPDATE`,
      [quizId, req.user.id]
    );

    if (existing.rowCount) {
      const attempt = existing.rows[0];
      const deadline = new Date(attempt.started_at).getTime() +
        Number(quiz.time_limit_minutes || 30) * 60 * 1000;

      if (now < deadline) {
        await client.query("COMMIT");
        return res.json({
          success: true,
          attempt,
          deadline: new Date(deadline).toISOString(),
          resumed: true,
        });
      }

      await client.query(
        `UPDATE quiz_attempts
         SET status = 'expired', submitted_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [attempt.id]
      );
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM quiz_attempts
       WHERE quiz_id = $1 AND student_id = $2`,
      [quizId, req.user.id]
    );

    if (countResult.rows[0].count >= quiz.max_attempts) {
      await client.query("ROLLBACK");
      return fail(res, 409, "You have reached the maximum number of attempts.");
    }

    const attemptNumber = countResult.rows[0].count + 1;

    const result = await client.query(
      `INSERT INTO quiz_attempts
         (quiz_id, student_id, attempt_number, status)
       VALUES ($1, $2, $3, 'in_progress')
       RETURNING id, quiz_id, student_id, attempt_number, started_at, status`,
      [quizId, req.user.id, attemptNumber]
    );

    await client.query("COMMIT");
    const attempt = result.rows[0];

    return res.status(201).json({
      success: true,
      attempt,
      deadline: new Date(
        new Date(attempt.started_at).getTime() +
        Number(quiz.time_limit_minutes || 30) * 60 * 1000
      ).toISOString(),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
}

async function getAttempt(req, res, next) {
  try {
    const { attemptId } = req.params;
    if (!validId(attemptId)) return fail(res, 400, "Invalid attempt ID.");

    const attemptResult = await pool.query(
      `SELECT a.id, a.quiz_id, a.attempt_number, a.started_at, a.status,
              q.title, q.description, q.instructions, q.time_limit_minutes,
              q.passing_score, q.show_results_immediately, q.allow_answer_review,
              a.started_at + (COALESCE(q.time_limit_minutes, 30) * INTERVAL '1 minute')
                AS deadline,
              CURRENT_TIMESTAMP >= a.started_at +
                (COALESCE(q.time_limit_minutes, 30) * INTERVAL '1 minute') AS is_expired
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.id = $1 AND a.student_id = $2`,
      [attemptId, req.user.id]
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) return fail(res, 404, "Quiz attempt not found.");

    if (!["in_progress", "submitted", "expired"].includes(attempt.status)) {
      return fail(res, 409, "This attempt is no longer available.");
    }

    const [questionsResult, answersResult, flagsResult] = await Promise.all([
      pool.query(
        `SELECT id, question_text, question_type, points, position
         FROM quiz_questions
         WHERE quiz_id = $1
         ORDER BY position`,
        [attempt.quiz_id]
      ),
      pool.query(
        `SELECT question_id, option_id, selected_option_id,
                selected_option_ids, answer_text
         FROM quiz_answers
         WHERE attempt_id = $1`,
        [attemptId]
      ),
      pool.query(
        `SELECT question_id, is_bookmarked, needs_revision
         FROM quiz_attempt_question_flags
         WHERE attempt_id = $1`,
        [attemptId]
      ),
    ]);

    const questionIds = questionsResult.rows.map((question) => question.id);
    const optionsResult = questionIds.length
      ? await pool.query(
          `SELECT id, question_id, option_text, position
           FROM quiz_options
           WHERE question_id = ANY($1::bigint[])
           ORDER BY position`,
          [questionIds]
        )
      : { rows: [] };

    return res.json({
      success: true,
      attempt: {
        id: attempt.id,
        quiz_id: attempt.quiz_id,
        attempt_number: attempt.attempt_number,
        started_at: attempt.started_at,
        deadline: attempt.deadline,
        status: attempt.status,
      },
      quiz: {
        title: attempt.title,
        description: attempt.description,
        instructions: attempt.instructions,
        time_limit_minutes: attempt.time_limit_minutes,
        passing_score: attempt.passing_score,
        show_results_immediately: attempt.show_results_immediately,
        allow_answer_review: attempt.allow_answer_review,
        questions: questionsResult.rows.map((question) => ({
          ...question,
          options: optionsResult.rows.filter(
            (option) => String(option.question_id) === String(question.id)
          ),
        })),
      },
      answers: answersResult.rows.map((answer) => ({
        question_id: answer.question_id,
        option_ids:
          answer.selected_option_ids?.length
            ? answer.selected_option_ids
            : answer.option_id || answer.selected_option_id
              ? [answer.option_id || answer.selected_option_id]
              : [],
        answer_text: answer.answer_text || "",
      })),
      flags: flagsResult.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function saveAnswer(req, res, next) {
  const client = await pool.connect();
  try {
    const { attemptId, questionId } = req.params;
    const { option_ids = [], answer_text = "" } = req.body;
    if (!validId(attemptId) || !validId(questionId)) {
      return fail(res, 400, "Invalid attempt or question ID.");
    }
    if (
      !Array.isArray(option_ids) ||
      option_ids.length > 10 ||
      option_ids.some((id) => !validId(id)) ||
      new Set(option_ids.map(String)).size !== option_ids.length ||
      typeof answer_text !== "string" ||
      answer_text.length > 20000
    ) {
      return fail(res, 400, "Answer format is invalid.");
    }

    await client.query("BEGIN");
    const attemptResult = await client.query(
      `SELECT a.id, a.quiz_id, a.started_at, a.status,
              q.time_limit_minutes,
              CURRENT_TIMESTAMP < a.started_at +
                (COALESCE(q.time_limit_minutes, 30) * INTERVAL '1 minute') AS can_save
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
    if (attempt.status !== "in_progress" || !attempt.can_save) {
      if (attempt.status === "in_progress") {
        await client.query(
          `UPDATE quiz_attempts
           SET status = 'expired', submitted_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [attemptId]
        );
        await client.query("COMMIT");
        return fail(res, 409, "The quiz time limit has expired.");
      }
      await client.query("ROLLBACK");
      return fail(res, 409, "This attempt is no longer accepting answers.");
    }

    const questionResult = await client.query(
      `SELECT id, question_type
       FROM quiz_questions
       WHERE id = $1 AND quiz_id = $2`,
      [questionId, attempt.quiz_id]
    );
    const question = questionResult.rows[0];
    if (!question) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Question not found in this attempt.");
    }

    const isChoice = [
      "single_choice",
      "multiple_choice",
      "true_false",
    ].includes(question.question_type);
    if (
      (isChoice && answer_text) ||
      (!isChoice && option_ids.length) ||
      (question.question_type === "single_choice" && option_ids.length > 1)
    ) {
      await client.query("ROLLBACK");
      return fail(res, 400, "Answer does not match this question type.");
    }

    if (option_ids.length) {
      const validOptions = await client.query(
        `SELECT id
         FROM quiz_options
         WHERE question_id = $1 AND id = ANY($2::bigint[])`,
        [questionId, option_ids]
      );
      if (validOptions.rowCount !== new Set(option_ids.map(String)).size) {
        await client.query("ROLLBACK");
        return fail(res, 400, "An answer option does not belong to this question.");
      }
    }

    const primaryOption = option_ids[0] || null;
    await client.query(
      `INSERT INTO quiz_answers
         (attempt_id, question_id, option_id, selected_option_id,
          selected_option_ids, answer_text)
       VALUES ($1, $2, $3, $3, $4::bigint[], $5)
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET option_id = EXCLUDED.option_id,
                     selected_option_id = EXCLUDED.selected_option_id,
                     selected_option_ids = EXCLUDED.selected_option_ids,
                     answer_text = EXCLUDED.answer_text`,
      [attemptId, questionId, primaryOption, option_ids, answer_text]
    );

    await client.query("COMMIT");
    return res.json({ success: true, saved_at: new Date().toISOString() });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
}

async function updateQuestionFlags(req, res, next) {
  const client = await pool.connect();
  try {
    const { attemptId, questionId } = req.params;
    const { is_bookmarked, needs_revision } = req.body;
    if (!validId(attemptId) || !validId(questionId)) {
      return fail(res, 400, "Invalid attempt or question ID.");
    }
    if (
      typeof is_bookmarked !== "boolean" ||
      typeof needs_revision !== "boolean"
    ) {
      return fail(res, 400, "Bookmark and revision values must be true or false.");
    }

    await client.query("BEGIN");
    const attemptResult = await client.query(
      `SELECT a.quiz_id, a.status,
              CURRENT_TIMESTAMP < a.started_at +
                (COALESCE(q.time_limit_minutes, 30) * INTERVAL '1 minute') AS can_save
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
    if (attempt.status !== "in_progress" || !attempt.can_save) {
      await client.query("ROLLBACK");
      return fail(res, 409, "This attempt is no longer accepting changes.");
    }

    const result = await client.query(
      `INSERT INTO quiz_attempt_question_flags
         (attempt_id, question_id, quiz_id, is_bookmarked, needs_revision, updated_at)
       SELECT $1, question.id, $3, $4, $5, CURRENT_TIMESTAMP
       FROM quiz_questions question
       WHERE question.id = $2 AND question.quiz_id = $3
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET is_bookmarked = EXCLUDED.is_bookmarked,
                     needs_revision = EXCLUDED.needs_revision,
                     updated_at = CURRENT_TIMESTAMP
       RETURNING question_id, is_bookmarked, needs_revision`,
      [attemptId, questionId, attempt.quiz_id, is_bookmarked, needs_revision]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Question not found in this attempt.");
    }

    await client.query("COMMIT");
    return res.json({ success: true, flags: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    client.release();
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
    if (answers !== undefined && !Array.isArray(answers)) {
      return fail(res, 400, "Answers must be an array.");
    }

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

    if (attempt.status === "submitted") {
      const existingResult = await client.query(
        `SELECT id, quiz_id, attempt_number, score, total_points, passed,
                status, submitted_at, grading_status,
                CASE WHEN total_points > 0 THEN
                  ROUND(100.0 * score / total_points, 2)
                ELSE 0 END AS percentage
         FROM quiz_attempts
         WHERE id = $1`,
        [attemptId]
      );
      await client.query("COMMIT");
      return res.json({
        success: true,
        message: "This attempt was already submitted.",
        result: existingResult.rows[0],
      });
    }

    if (!["in_progress", "expired"].includes(attempt.status)) {
      await client.query("ROLLBACK");
      return fail(res, 409, "This attempt has already been submitted or expired.");
    }

    const timeCheck = await client.query(
      `SELECT CURRENT_TIMESTAMP < $1::timestamptz +
         (COALESCE($2::integer, 30) * INTERVAL '1 minute') AS can_submit`,
      [attempt.started_at, attempt.time_limit_minutes]
    );
    const useSavedAnswers = answers === undefined || !timeCheck.rows[0].can_submit;

    const questionResult = await client.query(
      `SELECT id, points, question_type, accepted_answers
       FROM quiz_questions WHERE quiz_id = $1`,
      [attempt.quiz_id]
    );

    const submitted = new Map();

    if (useSavedAnswers) {
      const savedAnswers = await client.query(
        `SELECT question_id, option_id, selected_option_id,
                selected_option_ids, answer_text
         FROM quiz_answers WHERE attempt_id = $1`,
        [attemptId]
      );
      for (const answer of savedAnswers.rows) {
        submitted.set(String(answer.question_id), {
          option_ids: answer.selected_option_ids?.length
            ? answer.selected_option_ids
            : answer.option_id || answer.selected_option_id
              ? [answer.option_id || answer.selected_option_id]
              : [],
          answer_text: answer.answer_text || "",
        });
      }
    } else {
      for (const answer of answers) {
        const optionIds = answer.option_ids ??
          (answer.option_id == null ? [] : [answer.option_id]);
        if (
          !answer ||
          !validId(answer.question_id) ||
          !Array.isArray(optionIds) ||
          optionIds.some((id) => !validId(id)) ||
          typeof (answer.answer_text ?? "") !== "string" ||
          (answer.answer_text ?? "").length > 20000
        ) {
          await client.query("ROLLBACK");
          return fail(res, 400, "An answer contains invalid data.");
        }
        if (
          !questionResult.rows.some(
            (question) => String(question.id) === String(answer.question_id)
          ) ||
          submitted.has(String(answer.question_id))
        ) {
          await client.query("ROLLBACK");
          return fail(res, 400, "An answer references an invalid or duplicate question.");
        }
        submitted.set(String(answer.question_id), {
          option_ids: [...new Set(optionIds.map(String))],
          answer_text: answer.answer_text ?? "",
        });
      }
    }

    let score = 0;
    let pendingManual = false;
    const earnedByQuestion = new Map();
    const totalPoints = questionResult.rows.reduce(
      (sum, question) => sum + Number(question.points),
      0
    );

    for (const question of questionResult.rows) {
      const answer = submitted.get(String(question.id)) || {
        option_ids: [],
        answer_text: "",
      };
      const isChoice = [
        "single_choice",
        "multiple_choice",
        "true_false",
      ].includes(question.question_type);

      if (
        (isChoice && answer.answer_text) ||
        (!isChoice && answer.option_ids.length) ||
        (question.question_type !== "multiple_choice" &&
          answer.option_ids.length > 1)
      ) {
        await client.query("ROLLBACK");
        return fail(res, 400, "An answer does not match its question type.");
      }

      if (answer.option_ids.length) {
        const validOptions = await client.query(
          `SELECT id, is_correct FROM quiz_options
           WHERE question_id = $1 AND id = ANY($2::bigint[])`,
          [question.id, answer.option_ids]
        );
        if (
          validOptions.rowCount !== answer.option_ids.length
        ) {
          await client.query("ROLLBACK");
          return fail(res, 400, "Selected option does not belong to its question.");
        }

        const correctIds = await client.query(
          `SELECT id FROM quiz_options
           WHERE question_id = $1 AND is_correct = TRUE`,
          [question.id]
        );
        const selectedSet = new Set(answer.option_ids.map(String));
        const correctSet = new Set(correctIds.rows.map((row) => String(row.id)));
        if (
          selectedSet.size === correctSet.size &&
          [...selectedSet].every((id) => correctSet.has(id))
        ) {
          score += Number(question.points);
          earnedByQuestion.set(String(question.id), Number(question.points));
        }
      } else if (question.question_type === "short_answer" && answer.answer_text.trim()) {
        const normalize = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
        if ((question.accepted_answers || []).some(
          (accepted) => normalize(accepted) === normalize(answer.answer_text)
        )) {
          score += Number(question.points);
          earnedByQuestion.set(String(question.id), Number(question.points));
        }
      } else if (question.question_type === "essay" && answer.answer_text.trim()) {
        pendingManual = true;
      }
    }

    await client.query("DELETE FROM quiz_answers WHERE attempt_id = $1", [
      attemptId,
    ]);

    for (const [questionId, answer] of submitted.entries()) {
      const optionId = answer.option_ids[0] || null;
      const question = questionResult.rows.find(
        (item) => String(item.id) === questionId
      );
      const validOption = await client.query(
        `SELECT id FROM quiz_options
         WHERE question_id = $1 AND id = ANY($2::bigint[])`,
        [questionId, answer.option_ids]
      );
      if (validOption.rowCount !== answer.option_ids.length) {
        await client.query("ROLLBACK");
        return fail(res, 400, "Selected option does not belong to its question.");
      }

      await client.query(
        `INSERT INTO quiz_answers
           (attempt_id, question_id, option_id, selected_option_id,
            selected_option_ids, answer_text, marks_earned)
         VALUES ($1, $2, $3, $3, $4::bigint[], $5, $6)
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET option_id = EXCLUDED.option_id,
                       selected_option_id = EXCLUDED.selected_option_id,
                       selected_option_ids = EXCLUDED.selected_option_ids,
                       answer_text = EXCLUDED.answer_text,
                       marks_earned = EXCLUDED.marks_earned`,
        [
          attemptId,
          questionId,
          optionId,
          answer.option_ids,
          answer.answer_text,
          question.question_type === "essay"
            ? null
            : earnedByQuestion.get(questionId) || 0,
        ]
      );
    }

    const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
    const passed = !pendingManual && totalPoints > 0 &&
      percentage >= Number(attempt.passing_score);

    const updated = await client.query(
      `UPDATE quiz_attempts
       SET score = $1, total_points = $2, passed = $3,
           status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
           grading_status = $5
       WHERE id = $4
       RETURNING id, quiz_id, attempt_number, score,
                 total_points, passed, status, submitted_at, grading_status`,
      [score, totalPoints, passed, attemptId, pendingManual ? "pending_manual" : "automatic"]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: pendingManual
        ? "Quiz submitted and is awaiting manual grading."
        : "Quiz submitted and graded.",
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

async function getPendingGrading(req, res, next) {
  try {
    if (!["instructor", "admin"].includes(req.user.role)) {
      return fail(res, 403, "Instructor access is required.");
    }
    const result = await pool.query(
      `SELECT a.id AS attempt_id, a.quiz_id, a.attempt_number,
              a.submitted_at, q.title AS quiz_title, c.title AS course_title,
              student.id AS student_id, student.full_name AS student_name,
              question.id AS question_id, question.question_text,
              question.points AS max_points, answer.answer_text
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       JOIN courses c ON c.id = q.course_id
       JOIN users student ON student.id = a.student_id
       JOIN quiz_questions question
         ON question.quiz_id = q.id AND question.question_type = 'essay'
       LEFT JOIN quiz_answers answer
         ON answer.attempt_id = a.id AND answer.question_id = question.id
       WHERE a.status = 'submitted'
         AND a.grading_status = 'pending_manual'
         AND ($1::text = 'admin' OR c.instructor_id = $2)
       ORDER BY a.submitted_at ASC, a.id, question.position`,
      [req.user.role, req.user.id]
    );

    const attempts = new Map();
    for (const row of result.rows) {
      const key = String(row.attempt_id);
      if (!attempts.has(key)) {
        attempts.set(key, {
          attempt_id: row.attempt_id,
          quiz_id: row.quiz_id,
          attempt_number: row.attempt_number,
          submitted_at: row.submitted_at,
          quiz_title: row.quiz_title,
          course_title: row.course_title,
          student_id: row.student_id,
          student_name: row.student_name,
          questions: [],
        });
      }
      attempts.get(key).questions.push({
        question_id: row.question_id,
        question_text: row.question_text,
        max_points: row.max_points,
        answer_text: row.answer_text,
      });
    }
    return res.json({ success: true, attempts: [...attempts.values()] });
  } catch (error) {
    next(error);
  }
}

async function gradeAttempt(req, res, next) {
  const client = await pool.connect();
  try {
    if (!["instructor", "admin"].includes(req.user.role)) {
      return fail(res, 403, "Instructor access is required.");
    }
    const { attemptId } = req.params;
    const { grades, instructor_feedback = "" } = req.body;
    if (!validId(attemptId)) return fail(res, 400, "Invalid attempt ID.");
    if (
      !Array.isArray(grades) ||
      typeof instructor_feedback !== "string" ||
      instructor_feedback.length > 10000
    ) {
      return fail(res, 400, "Grading details are invalid.");
    }

    await client.query("BEGIN");
    const attemptResult = await client.query(
      `SELECT a.*, q.passing_score, c.instructor_id
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       JOIN courses c ON c.id = q.course_id
       WHERE a.id = $1
       FOR UPDATE`,
      [attemptId]
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      await client.query("ROLLBACK");
      return fail(res, 404, "Quiz attempt not found.");
    }
    if (
      req.user.role !== "admin" &&
      String(attempt.instructor_id) !== String(req.user.id)
    ) {
      await client.query("ROLLBACK");
      return fail(res, 403, "You cannot grade this assessment.");
    }
    if (!["pending_manual", "graded"].includes(attempt.grading_status)) {
      await client.query("ROLLBACK");
      return fail(res, 409, "This attempt does not require manual grading.");
    }

    const essayResult = await client.query(
      `SELECT id, points
       FROM quiz_questions
       WHERE quiz_id = $1 AND question_type = 'essay'
       ORDER BY position`,
      [attempt.quiz_id]
    );
    const essayQuestions = new Map(
      essayResult.rows.map((question) => [String(question.id), Number(question.points)])
    );
    const submittedGrades = new Map();
    for (const grade of grades) {
      if (
        !grade ||
        !validId(grade.question_id) ||
        !Number.isFinite(Number(grade.marks)) ||
        typeof (grade.feedback ?? "") !== "string" ||
        (grade.feedback ?? "").length > 10000 ||
        submittedGrades.has(String(grade.question_id))
      ) {
        await client.query("ROLLBACK");
        return fail(res, 400, "A question grade is invalid or duplicated.");
      }
      const maximum = essayQuestions.get(String(grade.question_id));
      const marks = Number(grade.marks);
      if (maximum === undefined || marks < 0 || marks > maximum) {
        await client.query("ROLLBACK");
        return fail(res, 400, "Marks must be within the question's maximum points.");
      }
      submittedGrades.set(String(grade.question_id), {
        marks,
        feedback: grade.feedback ?? "",
      });
    }
    if (
      submittedGrades.size !== essayQuestions.size ||
      [...essayQuestions.keys()].some((id) => !submittedGrades.has(id))
    ) {
      await client.query("ROLLBACK");
      return fail(res, 400, "Grade every essay question before finalizing.");
    }

    for (const [questionId, grade] of submittedGrades.entries()) {
      await client.query(
        `INSERT INTO quiz_answers
           (attempt_id, question_id, selected_option_ids, answer_text,
            marks_earned, feedback)
         VALUES ($1, $2, ARRAY[]::BIGINT[], '', $3, $4)
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET marks_earned = EXCLUDED.marks_earned,
                       feedback = EXCLUDED.feedback`,
        [attemptId, questionId, grade.marks, grade.feedback]
      );
    }

    const scoreResult = await client.query(
      `SELECT COALESCE(SUM(answer.marks_earned), 0) AS score,
              COALESCE(SUM(question.points), 0) AS total_points
       FROM quiz_questions question
       LEFT JOIN quiz_answers answer
         ON answer.question_id = question.id AND answer.attempt_id = $2
       WHERE question.quiz_id = $1`,
      [attempt.quiz_id, attemptId]
    );
    const { score, total_points: totalPoints } = scoreResult.rows[0];
    const percentage = Number(totalPoints) > 0
      ? (Number(score) / Number(totalPoints)) * 100
      : 0;
    const passed = Number(totalPoints) > 0 &&
      percentage >= Number(attempt.passing_score);

    const updated = await client.query(
      `UPDATE quiz_attempts
       SET score = $2, total_points = $3, passed = $4,
           grading_status = 'graded', instructor_feedback = $5,
           graded_by = $6, graded_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, quiz_id, attempt_number, score, total_points,
                 passed, status, grading_status, instructor_feedback,
                 graded_by, graded_at, submitted_at`,
      [
        attemptId,
        score,
        totalPoints,
        passed,
        instructor_feedback.trim(),
        req.user.id,
      ]
    );
    await client.query("COMMIT");
    return res.json({
      success: true,
      result: {
        ...updated.rows[0],
        percentage: Number(percentage.toFixed(2)),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
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
              a.grading_status,
              CASE WHEN q.show_results_immediately OR a.grading_status = 'graded'
                THEN a.score ELSE NULL END AS score,
              CASE WHEN q.show_results_immediately OR a.grading_status = 'graded'
                THEN a.total_points ELSE NULL END AS total_points,
              CASE WHEN q.show_results_immediately OR a.grading_status = 'graded'
                THEN a.passed ELSE NULL END AS passed,
              a.status,
              CASE WHEN (q.show_results_immediately OR a.grading_status = 'graded')
                    AND a.total_points > 0
                THEN ROUND(100.0 * a.score / a.total_points, 2)
                ELSE NULL END AS percentage,
              CASE WHEN q.show_results_immediately OR a.grading_status = 'graded'
                THEN a.instructor_feedback ELSE NULL END AS instructor_feedback
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

async function getAttemptResult(req, res, next) {
  try {
    const { attemptId } = req.params;
    if (!validId(attemptId)) return fail(res, 400, "Invalid attempt ID.");
    const result = await pool.query(
      `SELECT a.id AS attempt_id, a.quiz_id, a.attempt_number,
              a.submitted_at, a.score, a.total_points, a.passed,
              a.grading_status, a.instructor_feedback, q.title AS quiz_title,
              q.show_results_immediately, q.allow_answer_review
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.id = $1 AND a.student_id = $2 AND a.status = 'submitted'`,
      [attemptId, req.user.id]
    );
    const attempt = result.rows[0];
    if (!attempt) return fail(res, 404, "Assessment result not found.");
    if (attempt.grading_status === "pending_manual") {
      return res.status(202).json({
        success: true,
        released: false,
        grading_status: attempt.grading_status,
        message: "Your result is waiting for instructor grading.",
      });
    }
    if (!attempt.show_results_immediately && attempt.grading_status !== "graded") {
      return res.status(202).json({
        success: true,
        released: false,
        grading_status: attempt.grading_status,
        message: "Your assessment result has not been released yet.",
      });
    }

    const response = {
      ...attempt,
      percentage:
        Number(attempt.total_points) > 0
          ? Number(
              ((Number(attempt.score) / Number(attempt.total_points)) * 100).toFixed(2)
            )
          : 0,
      released: true,
    };

    if (attempt.allow_answer_review) {
      const questionsResult = await pool.query(
        `SELECT question.id AS question_id, question.question_text,
                question.question_type, question.points,
                answer.answer_text, answer.marks_earned, answer.feedback,
                answer.selected_option_ids, answer.option_id,
                answer.selected_option_id
         FROM quiz_questions question
         LEFT JOIN quiz_answers answer
           ON answer.question_id = question.id AND answer.attempt_id = $2
         WHERE question.quiz_id = $1
         ORDER BY question.position`,
        [attempt.quiz_id, attemptId]
      );
      const optionsResult = await pool.query(
        `SELECT option.id, option.question_id, option.option_text,
                option.is_correct
         FROM quiz_options option
         JOIN quiz_questions question ON question.id = option.question_id
         WHERE question.quiz_id = $1
         ORDER BY question.position, option.position`,
        [attempt.quiz_id]
      );
      response.questions = questionsResult.rows.map((question) => ({
        ...question,
        selected_option_ids:
          question.selected_option_ids?.length
            ? question.selected_option_ids
            : question.option_id || question.selected_option_id
              ? [question.option_id || question.selected_option_id]
              : [],
        options: optionsResult.rows.filter(
          (option) => String(option.question_id) === String(question.question_id)
        ),
      }));
    }

    return res.json({ success: true, released: true, result: response });
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
  getAttempt,
  saveAnswer,
  updateQuestionFlags,
  submitAttempt,
  getAttemptResult,
  getMyAttempts,
  getPendingGrading,
  gradeAttempt,
};