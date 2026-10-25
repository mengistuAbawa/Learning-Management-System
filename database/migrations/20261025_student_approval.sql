BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_approval_status_check'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_approval_status_check
            CHECK (approval_status IN ('pending', 'approved', 'rejected'));
    END IF;
END
$$;

ALTER TABLE users
    ALTER COLUMN approval_status SET DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS idx_users_pending_students
    ON users (created_at DESC, id DESC)
    WHERE role = 'student' AND approval_status = 'pending';

COMMIT;
