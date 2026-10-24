BEGIN;

-- ============================================================================
-- Migration: Analytics Schema Corrections
-- Purpose: Add missing columns required by analytics queries
-- Date: October 24, 2026
-- ============================================================================

-- 1. Add missing columns to quiz_attempts
-- These columns support analytics calculations and attempt tracking.

ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
    ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1
        CHECK (attempt_number > 0),
    ADD COLUMN IF NOT EXISTS total_points NUMERIC(7, 2)
        CHECK (total_points > 0);

-- 2. Populate total_points for existing quiz attempts
-- Calculate from the sum of points of all questions in the quiz
UPDATE quiz_attempts qa
SET total_points = (
    SELECT COALESCE(SUM(points), 0)
    FROM quiz_questions qq
    WHERE qq.quiz_id = qa.quiz_id
)
WHERE total_points IS NULL;

-- 3. Populate attempt_number for existing quiz attempts
-- Rank attempts per student per quiz by created time
UPDATE quiz_attempts qa
SET attempt_number = ranked.attempt_num
FROM (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY student_id, quiz_id
            ORDER BY COALESCE(submitted_at, started_at) ASC, id ASC
        ) AS attempt_num
    FROM quiz_attempts
) ranked
WHERE qa.id = ranked.id;

-- 4. Update status for existing quiz attempts
-- Mark as 'submitted' if submitted_at is not NULL, otherwise 'in_progress'
UPDATE quiz_attempts
SET status = CASE
    WHEN submitted_at IS NOT NULL THEN 'submitted'
    ELSE 'in_progress'
END
WHERE status = 'in_progress';

-- 5. Add missing columns to assignments
-- is_published controls visibility in student analytics

ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark all existing assignments as published by default to maintain backward compatibility
UPDATE assignments
SET is_published = TRUE
WHERE is_published = FALSE;

-- 6. Add max_attempts configuration to quizzes (for future analytics refinement)
-- Allows limiting the number of attempts per student
ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER
        CHECK (max_attempts IS NULL OR max_attempts > 0);

-- 7. Add is_required flag to lessons (for refined progress tracking)
-- Allows distinguishing required from optional lessons
ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE;

-- 8. Create indexes for analytics query performance
-- These indexes support the complex aggregation queries used in analytics

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_status_submitted
    ON quiz_attempts(student_id, quiz_id, status, submitted_at)
    WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_by_student_and_quiz
    ON quiz_attempts(student_id, quiz_id, attempt_number)
    WHERE status IN ('submitted', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_assignments_published
    ON assignments(course_id, is_published)
    WHERE is_published = TRUE;

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_graded
    ON assignment_submissions(assignment_id, student_id, grade)
    WHERE grade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_progress_completed
    ON lesson_progress(enrollment_id, completed)
    WHERE completed = TRUE;

CREATE INDEX IF NOT EXISTS idx_lessons_required
    ON lessons(module_id, is_required)
    WHERE is_required = TRUE;

-- 9. Verify data integrity
-- Ensure no orphaned or invalid records exist after schema changes

-- Check that all quiz attempts have valid total_points
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_count
    FROM quiz_attempts
    WHERE total_points IS NULL OR total_points <= 0;
    
    IF invalid_count > 0 THEN
        RAISE WARNING 'Found % quiz attempts with invalid total_points after migration', invalid_count;
    END IF;
END $$;

-- Check that all quiz attempts have valid attempt_number
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_count
    FROM quiz_attempts
    WHERE attempt_number IS NULL OR attempt_number < 1;
    
    IF invalid_count > 0 THEN
        RAISE WARNING 'Found % quiz attempts with invalid attempt_number after migration', invalid_count;
    END IF;
END $$;

-- 10. Document migration metadata
COMMENT ON COLUMN quiz_attempts.status IS 'Tracks attempt lifecycle: in_progress = not yet submitted, submitted = completed and graded, abandoned = user left without submitting';
COMMENT ON COLUMN quiz_attempts.attempt_number IS 'Sequence number for this student''s attempts on this quiz (1-indexed)';
COMMENT ON COLUMN quiz_attempts.total_points IS 'Sum of all question points in the quiz at time of attempt; used for score percentage calculation';
COMMENT ON COLUMN assignments.is_published IS 'Controls visibility in student analytics and assignment listings; unpublished assignments are admin-only';
COMMENT ON COLUMN quizzes.max_attempts IS 'Maximum number of times a student can attempt this quiz; NULL = unlimited';
COMMENT ON COLUMN lessons.is_required IS 'TRUE = lesson counts toward course completion; FALSE = optional enrichment or extra credit';

COMMIT;
