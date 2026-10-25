BEGIN;

ALTER TABLE course_videos
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lesson_id BIGINT REFERENCES lessons(id) ON DELETE SET NULL;

ALTER TABLE course_videos
  DROP CONSTRAINT IF EXISTS course_videos_position_check;

ALTER TABLE course_videos
  ADD CONSTRAINT course_videos_position_check CHECK (position > 0);

CREATE INDEX IF NOT EXISTS idx_course_videos_course_position
  ON course_videos(course_id, position, created_at);

CREATE INDEX IF NOT EXISTS idx_course_videos_lesson
  ON course_videos(lesson_id)
  WHERE lesson_id IS NOT NULL;

COMMIT;

-- Rollback: remove the index and columns only after exporting any new metadata.
