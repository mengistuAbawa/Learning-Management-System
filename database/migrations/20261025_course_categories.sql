BEGIN;

CREATE TABLE IF NOT EXISTS course_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_categories_name_lower
    ON course_categories (LOWER(name));

INSERT INTO course_categories (name)
SELECT MIN(BTRIM(category))
FROM courses
WHERE category IS NOT NULL AND BTRIM(category) <> ''
GROUP BY LOWER(BTRIM(category))
ON CONFLICT DO NOTHING;

COMMIT;
