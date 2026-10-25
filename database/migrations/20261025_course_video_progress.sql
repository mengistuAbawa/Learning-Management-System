BEGIN;

CREATE TABLE IF NOT EXISTS course_video_progress (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES course_videos(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_position_seconds INTEGER NOT NULL DEFAULT 0
        CHECK (last_position_seconds >= 0),
    duration_seconds INTEGER
        CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (video_id, user_id),
    CHECK ((completed = FALSE) OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_course_video_progress_video
    ON course_video_progress(video_id, completed);

CREATE INDEX IF NOT EXISTS idx_course_video_progress_user
    ON course_video_progress(user_id, updated_at DESC);

COMMIT;

-- Safe rollback (only if intentionally discarding recorded viewing progress):
-- BEGIN;
-- DROP TABLE IF EXISTS course_video_progress;
-- COMMIT;
