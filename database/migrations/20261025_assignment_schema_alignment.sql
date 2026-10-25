BEGIN;

-- Align the original bootstrap schema with the column names already used by
-- the assignment API. Renames preserve all historical content and grades.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignments' AND column_name = 'instructions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignments' AND column_name = 'description'
  ) THEN
    ALTER TABLE assignments RENAME COLUMN instructions TO description;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignments' AND column_name = 'max_score'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignments' AND column_name = 'max_points'
  ) THEN
    ALTER TABLE assignments RENAME COLUMN max_score TO max_points;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignment_submissions' AND column_name = 'file_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignment_submissions' AND column_name = 'submission_url'
  ) THEN
    ALTER TABLE assignment_submissions RENAME COLUMN file_url TO submission_url;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignment_submissions' AND column_name = 'score'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'assignment_submissions' AND column_name = 'grade'
  ) THEN
    ALTER TABLE assignment_submissions RENAME COLUMN score TO grade;
  END IF;
END $$;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS submission_text TEXT,
  ADD COLUMN IF NOT EXISTS submission_url TEXT,
  ADD COLUMN IF NOT EXISTS grade NUMERIC(7, 2),
  ADD COLUMN IF NOT EXISTS feedback TEXT,
  ADD COLUMN IF NOT EXISTS graded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'submitted';

UPDATE assignment_submissions
SET status = CASE WHEN grade IS NULL THEN 'submitted' ELSE 'graded' END;

ALTER TABLE assignment_submissions
  ALTER COLUMN status SET DEFAULT 'submitted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignment_submissions_status_check'
      AND conrelid = 'assignment_submissions'::regclass
  ) THEN
    ALTER TABLE assignment_submissions
      ADD CONSTRAINT assignment_submissions_status_check
      CHECK (status IN ('submitted', 'graded'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_pending
  ON assignment_submissions(submitted_at, id)
  WHERE grade IS NULL;

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_graded
  ON assignment_submissions(assignment_id, student_id, grade)
  WHERE grade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_course_due
  ON assignments(course_id, due_at)
  WHERE due_at IS NOT NULL;

COMMIT;

-- Rollback notes: reverse the four column renames if required. Do not drop
-- status, feedback, graded_by, graded_at, or submission_text until any data
-- written after this migration has been exported and reviewed.
