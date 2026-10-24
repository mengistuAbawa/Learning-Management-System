BEGIN;

CREATE TABLE IF NOT EXISTS course_videos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    instructor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    storage_key UUID NOT NULL UNIQUE,
    media_type VARCHAR(100) NOT NULL
        CHECK (media_type IN ('video/webm', 'video/mp4', 'video/ogg')),
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_videos_course_created
    ON course_videos(course_id, created_at DESC);

COMMIT;
