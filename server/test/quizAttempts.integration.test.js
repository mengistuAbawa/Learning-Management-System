require("dotenv").config();

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const { pool } = require("../src/config/db");

let server;
let baseUrl;
let instructorId;
let otherInstructorId;
let studentId;
let otherStudentId;
let courseId;
let enrollmentIds = [];
let quizId;
let delayedQuizId;
let delayedQuestionId;
let delayedOptionId;
let questionIds = [];
let optionIds = [];
let instructorToken;
let otherInstructorToken;
let studentToken;
let otherStudentToken;

function createToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    issuer: "learnsphere-lms",
    audience: "learnsphere-lms-client",
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function insertUser(suffix, role) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, 'test-only', $3)
     RETURNING id`,
    [
      `Quiz Attempt ${role}`,
      `quiz-attempt-${suffix}-${role}@example.invalid`,
      role,
    ]
  );
  return result.rows[0].id;
}

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to at least 32 characters to run integration tests.");
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  instructorId = await insertUser(`${suffix}-instructor`, "instructor");
  otherInstructorId = await insertUser(`${suffix}-other-instructor`, "instructor");
  studentId = await insertUser(`${suffix}-student`, "student");
  otherStudentId = await insertUser(`${suffix}-other-student`, "student");

  const course = await pool.query(
    `INSERT INTO courses (instructor_id, title, slug, description, status)
     VALUES ($1, 'Quiz Attempt Course', $2, 'Integration test course.', 'published')
     RETURNING id`,
    [instructorId, `quiz-attempt-${suffix}`]
  );
  courseId = course.rows[0].id;

  for (const learnerId of [studentId, otherStudentId]) {
    const enrollment = await pool.query(
      `INSERT INTO enrollments (student_id, course_id, status)
       VALUES ($1, $2, 'active') RETURNING id`,
      [learnerId, courseId]
    );
    enrollmentIds.push(enrollment.rows[0].id);
  }

  const quiz = await pool.query(
    `INSERT INTO quizzes
       (course_id, title, description, time_limit_minutes, passing_score,
        max_attempts, is_published, allow_answer_review)
     VALUES ($1, 'Assessment Autosave Test', 'Test description.', 20, 50, 2, TRUE, TRUE)
     RETURNING id`,
    [courseId]
  );
  quizId = quiz.rows[0].id;

  const delayedQuiz = await pool.query(
    `INSERT INTO quizzes
       (course_id, title, time_limit_minutes, passing_score, max_attempts,
        is_published, show_results_immediately)
     VALUES ($1, 'Delayed Result Test', 20, 50, 2, TRUE, FALSE)
     RETURNING id`,
    [courseId]
  );
  delayedQuizId = delayedQuiz.rows[0].id;

  const delayedQuestion = await pool.query(
    `INSERT INTO quiz_questions
       (quiz_id, question_text, question_type, points, position)
     VALUES ($1, 'Choose the correct answer.', 'single_choice', 1, 1)
     RETURNING id`,
    [delayedQuizId]
  );
  delayedQuestionId = delayedQuestion.rows[0].id;

  const delayedOption = await pool.query(
    `INSERT INTO quiz_options (question_id, option_text, is_correct, position)
     VALUES ($1, 'Correct answer', TRUE, 1)
     RETURNING id`,
    [delayedQuestionId]
  );
  delayedOptionId = delayedOption.rows[0].id;
  await pool.query(
    `INSERT INTO quiz_options (question_id, option_text, is_correct, position)
     VALUES ($1, 'Incorrect answer', FALSE, 2)`,
    [delayedQuestionId]
  );

  const choice = await pool.query(
    `INSERT INTO quiz_questions
       (quiz_id, question_text, question_type, points, position)
     VALUES ($1, 'Select both correct values', 'multiple_choice', 2, 1)
     RETURNING id`,
    [quizId]
  );
  questionIds.push(choice.rows[0].id);

  for (const [position, text, isCorrect] of [
    [1, "Correct A", true],
    [2, "Correct B", true],
    [3, "Incorrect", false],
  ]) {
    const option = await pool.query(
      `INSERT INTO quiz_options (question_id, option_text, is_correct, position)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [choice.rows[0].id, text, isCorrect, position]
    );
    optionIds.push(option.rows[0].id);
  }

  const shortAnswer = await pool.query(
    `INSERT INTO quiz_questions
       (quiz_id, question_text, question_type, points, position, accepted_answers)
     VALUES ($1, 'What is the normalized phrase?', 'short_answer', 1, 2,
             ARRAY['Hello   World']::TEXT[])
     RETURNING id`,
    [quizId]
  );
  questionIds.push(shortAnswer.rows[0].id);

  const essay = await pool.query(
    `INSERT INTO quiz_questions
       (quiz_id, question_text, question_type, points, position)
     VALUES ($1, 'Explain your reasoning.', 'essay', 5, 3)
     RETURNING id`,
    [quizId]
  );
  questionIds.push(essay.rows[0].id);

  instructorToken = createToken(instructorId);
  otherInstructorToken = createToken(otherInstructorId);
  studentToken = createToken(studentId);
  otherStudentToken = createToken(otherStudentId);

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (enrollmentIds.length) {
      await pool.query(
        "DELETE FROM enrollments WHERE id = ANY($1::bigint[])",
        [enrollmentIds]
      );
    }
    if (courseId) {
      await pool.query(
        `DELETE FROM quiz_attempts
         WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id = $1)`,
        [courseId]
      );
      await pool.query("DELETE FROM courses WHERE id = $1", [courseId]);
    }
    const userIds = [
      instructorId,
      otherInstructorId,
      studentId,
      otherStudentId,
    ].filter(Boolean);
    if (userIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
    }
  } finally {
    await pool.end();
  }
});

test("assessment attempts persist answers, enforce ownership, and support manual grading", async () => {
  const invalidQuestion = await request(`/quizzes/${quizId}/questions`, {
    token: instructorToken,
    method: "POST",
    body: {
      question_text: "Choose one answer.",
      question_type: "single_choice",
      options: [
        { text: "Same", is_correct: true },
        { text: "same", is_correct: false },
      ],
    },
  });
  assert.equal(invalidQuestion.status, 400);

  const delayedStart = await request(`/quizzes/${delayedQuizId}/attempts`, {
    token: studentToken,
    method: "POST",
  });
  assert.equal(delayedStart.status, 201);
  const delayedAttemptId = delayedStart.body.attempt.id;
  const delayedSaved = await request(
    `/quiz-attempts/${delayedAttemptId}/answers/${delayedQuestionId}`,
    {
      token: studentToken,
      method: "PUT",
      body: { option_ids: [delayedOptionId], answer_text: "" },
    }
  );
  assert.equal(delayedSaved.status, 200);
  const delayedSubmitted = await request(
    `/quiz-attempts/${delayedAttemptId}/submit`,
    { token: studentToken, method: "POST", body: {} }
  );
  assert.equal(delayedSubmitted.status, 200);
  assert.equal(delayedSubmitted.body.result.released, false);
  assert.equal(delayedSubmitted.body.result.score, null);
  const delayedResult = await request(
    `/quiz-attempts/${delayedAttemptId}/result`,
    { token: studentToken }
  );
  assert.equal(delayedResult.status, 202);

  const publicQuiz = await request(`/quizzes/${quizId}`, { token: studentToken });
  assert.equal(publicQuiz.status, 200);
  assert.equal("is_correct" in publicQuiz.body.quiz.questions[0].options[0], false);

  const started = await request(`/quizzes/${quizId}/attempts`, {
    token: studentToken,
    method: "POST",
  });
  assert.equal(started.status, 201);
  const attemptId = started.body.attempt.id;

  const savedChoice = await request(
    `/quiz-attempts/${attemptId}/answers/${questionIds[0]}`,
    {
      token: studentToken,
      method: "PUT",
      body: { option_ids: optionIds.slice(0, 2), answer_text: "" },
    }
  );
  assert.equal(savedChoice.status, 200);

  const savedShortAnswer = await request(
    `/quiz-attempts/${attemptId}/answers/${questionIds[1]}`,
    {
      token: studentToken,
      method: "PUT",
      body: { option_ids: [], answer_text: " hello world " },
    }
  );
  assert.equal(savedShortAnswer.status, 200);

  const savedEssay = await request(
    `/quiz-attempts/${attemptId}/answers/${questionIds[2]}`,
    {
      token: studentToken,
      method: "PUT",
      body: { option_ids: [], answer_text: "My explanation." },
    }
  );
  assert.equal(savedEssay.status, 200);

  const flag = await request(
    `/quiz-attempts/${attemptId}/questions/${questionIds[0]}/flags`,
    {
      token: studentToken,
      method: "PUT",
      body: { is_bookmarked: true, needs_revision: true },
    }
  );
  assert.equal(flag.status, 200);

  const otherLearnerCannotRead = await request(`/quiz-attempts/${attemptId}`, {
    token: otherStudentToken,
  });
  assert.equal(otherLearnerCannotRead.status, 404);

  const restored = await request(`/quiz-attempts/${attemptId}`, {
    token: studentToken,
  });
  assert.equal(restored.status, 200);
  assert.deepEqual(
    restored.body.answers.find((answer) => String(answer.question_id) === String(questionIds[0])).option_ids.map(String),
    optionIds.slice(0, 2).map(String)
  );
  assert.equal(restored.body.flags[0].is_bookmarked, true);
  assert.equal("is_correct" in restored.body.quiz.questions[0].options[0], false);

  const submitted = await request(`/quiz-attempts/${attemptId}/submit`, {
    token: studentToken,
    method: "POST",
    body: {},
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.result.grading_status, "pending_manual");
  assert.equal(submitted.body.result.score, null);

  const pendingResult = await request(`/quiz-attempts/${attemptId}/result`, {
    token: studentToken,
  });
  assert.equal(pendingResult.status, 202);
  assert.equal(pendingResult.body.released, false);

  const attemptHistory = await request("/quiz-attempts/mine", {
    token: studentToken,
  });
  const pendingHistoryItem = attemptHistory.body.attempts.find(
    (item) => String(item.attempt_id) === String(attemptId)
  );
  assert.equal(attemptHistory.status, 200);
  assert.equal(pendingHistoryItem.score, null);
  assert.equal(pendingHistoryItem.total_points, null);
  assert.equal(pendingHistoryItem.passed, null);

  const studentAnalytics = await request("/analytics/overview", {
    token: studentToken,
  });
  const pendingAnalyticsItem = studentAnalytics.body.analytics.quizAnalytics.recentAttempts.find(
    (item) => String(item.attempt_id) === String(attemptId)
  );
  assert.equal(studentAnalytics.status, 200);
  assert.equal(pendingAnalyticsItem.raw_score, null);
  assert.equal(pendingAnalyticsItem.total_points, null);
  assert.equal(pendingAnalyticsItem.score_percentage, null);
  assert.equal(pendingAnalyticsItem.passed, null);

  const pendingAsWrongInstructor = await request("/instructor/quizzes/grading", {
    token: otherInstructorToken,
  });
  assert.equal(pendingAsWrongInstructor.status, 200);
  assert.equal(
    pendingAsWrongInstructor.body.attempts.some(
      (item) => String(item.attempt_id) === String(attemptId)
    ),
    false
  );

  const invalidGrade = await request(`/instructor/quiz-attempts/${attemptId}/grade`, {
    token: instructorToken,
    method: "PUT",
    body: {
      grades: [{ question_id: questionIds[2], marks: 99 }],
      instructor_feedback: "",
    },
  });
  assert.equal(invalidGrade.status, 400);

  const grade = await request(`/instructor/quiz-attempts/${attemptId}/grade`, {
    token: instructorToken,
    method: "PUT",
    body: {
      grades: [
        {
          question_id: questionIds[2],
          marks: 4,
          feedback: "Good explanation.",
        },
      ],
      instructor_feedback: "Well done.",
    },
  });
  assert.equal(grade.status, 200);
  assert.equal(Number(grade.body.result.score), 7);
  assert.equal(grade.body.result.passed, true);

  const releasedResult = await request(`/quiz-attempts/${attemptId}/result`, {
    token: studentToken,
  });
  assert.equal(releasedResult.status, 200);
  assert.equal(releasedResult.body.result.instructor_feedback, "Well done.");
  assert.equal(
    releasedResult.body.result.questions.find(
      (question) => String(question.question_id) === String(questionIds[0])
    ).options.filter((option) => option.is_correct).length,
    2
  );

  const duplicateSubmission = await request(`/quiz-attempts/${attemptId}/submit`, {
    token: studentToken,
    method: "POST",
    body: {},
  });
  assert.equal(duplicateSubmission.status, 200);
  assert.equal(Number(duplicateSubmission.body.result.score), 7);
});
