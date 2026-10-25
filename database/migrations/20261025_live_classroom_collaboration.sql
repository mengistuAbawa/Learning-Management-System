BEGIN;

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS whiteboard_student_editing BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS live_class_chat_messages (
  id UUID PRIMARY KEY,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_class_chat_history
  ON live_class_chat_messages (live_class_id, created_at, id);

CREATE TABLE IF NOT EXISTS live_class_polls (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  question VARCHAR(500) NOT NULL CHECK (char_length(question) BETWEEN 3 AND 500),
  options TEXT[] NOT NULL CHECK (
    cardinality(options) BETWEEN 2 AND 10
  ),
  status VARCHAR(10) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  results_released BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_class_polls_session
  ON live_class_polls (live_class_id, created_at DESC);

CREATE TABLE IF NOT EXISTS live_class_poll_responses (
  poll_id BIGINT NOT NULL REFERENCES live_class_polls(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  option_index SMALLINT NOT NULL CHECK (option_index BETWEEN 0 AND 9),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_class_whiteboard_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('stroke', 'clear')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_class_whiteboard_history
  ON live_class_whiteboard_events (live_class_id, id DESC);

CREATE TABLE IF NOT EXISTS live_class_attendance (
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  first_joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ,
  last_left_at TIMESTAMPTZ,
  connected_since TIMESTAMPTZ,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0
    CHECK (total_duration_seconds >= 0),
  join_count INTEGER NOT NULL DEFAULT 0 CHECK (join_count >= 0),
  PRIMARY KEY (live_class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_class_attendance_session
  ON live_class_attendance (live_class_id, last_joined_at DESC);

COMMIT;
