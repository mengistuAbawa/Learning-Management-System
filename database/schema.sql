
BEGIN;

-- 1. Users: students, instructors, and administrators
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student'
        CHECK (role IN ('student', 'instructor', 'admin')),
    avatar_url TEXT,
    bio TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Courses
CREATE TABLE courses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instructor_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(100),
    level VARCHAR(20) NOT NULL DEFAULT 'beginner'
        CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    thumbnail_url TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Course modules
CREATE TABLE modules (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id)
        ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL CHECK (position > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id, position),
    UNIQUE (id, course_id)
);

-- 4. Lessons
CREATE TABLE lessons (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_id BIGINT NOT NULL REFERENCES modules(id)
        ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    video_url TEXT,
    resource_url TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 0
        CHECK (duration_minutes >= 0),
    is_preview BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL CHECK (position > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, position)
);

-- 5. Student course enrollments
CREATE TABLE enrollments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    course_id BIGINT NOT NULL REFERENCES courses(id)
        ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'cancelled')),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (student_id, course_id)
);

-- 6. Lesson completion and progress
CREATE TABLE lesson_progress (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_id BIGINT NOT NULL REFERENCES enrollments(id)
        ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lessons(id)
        ON DELETE CASCADE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    last_position_seconds INTEGER NOT NULL DEFAULT 0
        CHECK (last_position_seconds >= 0),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (enrollment_id, lesson_id)
);

-- 7. Quizzes
CREATE TABLE quizzes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id)
        ON DELETE CASCADE,
    module_id BIGINT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    passing_score NUMERIC(5, 2) NOT NULL DEFAULT 70
        CHECK (passing_score BETWEEN 0 AND 100),
    time_limit_minutes INTEGER
        CHECK (time_limit_minutes > 0),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (module_id, course_id)
        REFERENCES modules(id, course_id)
        ON DELETE CASCADE
);

-- 8. Quiz questions
CREATE TABLE quiz_questions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL REFERENCES quizzes(id)
        ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL DEFAULT 'single_choice'
        CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false')),
    points NUMERIC(7, 2) NOT NULL DEFAULT 1
        CHECK (points > 0),
    position INTEGER NOT NULL CHECK (position > 0),
    UNIQUE (quiz_id, position),
    UNIQUE (id, quiz_id)
);

-- 9. Answer options
CREATE TABLE quiz_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES quiz_questions(id)
        ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL CHECK (position > 0),
    UNIQUE (question_id, position),
    UNIQUE (id, question_id)
);

-- 10. Quiz attempts
CREATE TABLE quiz_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL REFERENCES quizzes(id)
        ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    score NUMERIC(7, 2)
        CHECK (score BETWEEN 0 AND 100),
    passed BOOLEAN,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ
);

-- 11. Answers submitted for quiz questions
CREATE TABLE quiz_answers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES quiz_attempts(id)
        ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES quiz_questions(id)
        ON DELETE RESTRICT,
    selected_option_id BIGINT,
    is_correct BOOLEAN,
    UNIQUE (attempt_id, question_id),
    FOREIGN KEY (selected_option_id, question_id)
        REFERENCES quiz_options(id, question_id)
        ON DELETE RESTRICT
);

-- 12. Assignments
CREATE TABLE assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id)
        ON DELETE CASCADE,
    module_id BIGINT,
    title VARCHAR(200) NOT NULL,
    instructions TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    max_score NUMERIC(7, 2) NOT NULL DEFAULT 100
        CHECK (max_score > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (module_id, course_id)
        REFERENCES modules(id, course_id)
        ON DELETE CASCADE
);

-- 13. Assignment submissions
CREATE TABLE assignment_submissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    assignment_id BIGINT NOT NULL REFERENCES assignments(id)
        ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    submission_text TEXT,
    file_url TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    score NUMERIC(7, 2)
        CHECK (score >= 0),
    feedback TEXT,
    graded_by BIGINT REFERENCES users(id)
        ON DELETE SET NULL,
    graded_at TIMESTAMPTZ,
    UNIQUE (assignment_id, student_id)
);

-- 14. Course completion certificates
CREATE TABLE certificates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_id BIGINT NOT NULL UNIQUE REFERENCES enrollments(id)
        ON DELETE CASCADE,
    certificate_code UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. User notifications
CREATE TABLE notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    link_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_courses_instructor ON courses(instructor_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_modules_course ON modules(course_id);
CREATE INDEX idx_lessons_module ON lessons(module_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_progress_enrollment ON lesson_progress(enrollment_id);
CREATE INDEX idx_quizzes_course ON quizzes(course_id);
CREATE INDEX idx_attempts_student_quiz
    ON quiz_attempts(student_id, quiz_id);
CREATE INDEX idx_assignments_course ON assignments(course_id);
CREATE INDEX idx_submissions_student ON assignment_submissions(student_id);
CREATE INDEX idx_notifications_unread
    ON notifications(user_id, created_at DESC)
    WHERE is_read = FALSE;

COMMIT;
