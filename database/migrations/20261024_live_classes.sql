BEGIN;

CREATE TABLE IF NOT EXISTS live_classes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    instructor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    learning_objectives TEXT NOT NULL DEFAULT '',
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL
        CHECK (duration_minutes BETWEEN 5 AND 240),
    time_zone VARCHAR(100) NOT NULL,
    room_name UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ended_at IS NULL OR started_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_live_classes_instructor_schedule
    ON live_classes(instructor_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_classes_course_schedule
    ON live_classes(course_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_classes_status_schedule
    ON live_classes(status, scheduled_at);

COMMIT;
