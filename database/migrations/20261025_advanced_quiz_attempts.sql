BEGIN;

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_results_immediately BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_answer_review BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS accepted_answers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE quiz_questions
  DROP CONSTRAINT IF EXISTS quiz_questions_question_type_check;

ALTER TABLE quiz_questions
  ADD CONSTRAINT quiz_questions_question_type_check
    CHECK (question_type IN (
      'single_choice',
      'multiple_choice',
      'true_false',
      'short_answer',
      'essay'
    ));

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS grading_status VARCHAR(20) NOT NULL DEFAULT 'automatic'
    CHECK (grading_status IN ('automatic', 'pending_manual', 'graded'));

ALTER TABLE quiz_attempts
  DROP CONSTRAINT IF EXISTS quiz_attempts_score_check;

ALTER TABLE quiz_attempts
  ADD CONSTRAINT quiz_attempts_score_check CHECK (score IS NULL OR score >= 0);

ALTER TABLE quiz_answers
  ADD COLUMN IF NOT EXISTS selected_option_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  ADD COLUMN IF NOT EXISTS answer_text TEXT,
  ADD COLUMN IF NOT EXISTS marks_earned NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS feedback TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_id_quiz_id
  ON quiz_attempts(id, quiz_id);

CREATE TABLE IF NOT EXISTS quiz_attempt_question_flags (
  attempt_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  quiz_id BIGINT NOT NULL,
  is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  needs_revision BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id, quiz_id)
    REFERENCES quiz_attempts(id, quiz_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, quiz_id)
    REFERENCES quiz_questions(id, quiz_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_flags_quiz
  ON quiz_attempt_question_flags(attempt_id, quiz_id);

COMMIT;
