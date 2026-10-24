BEGIN;

ALTER TABLE course_videos
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'published'));

COMMIT;
