BEGIN;

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS participants_restricted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS live_class_participants (
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (live_class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_class_participants_user
  ON live_class_participants (user_id, live_class_id);

COMMIT;
