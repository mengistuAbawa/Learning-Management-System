# Instructor dashboard implementation notes

## Repository audit

The repository already has React/Vite, React Router, Tailwind, Axios, Express/CommonJS, PostgreSQL, JWT role checks, and installed `livekit-client` / `livekit-server-sdk` packages. No package was added.

Existing functionality reused:

- Instructor dashboard, instructor-owned course APIs, course/module/lesson builder, lesson reorder, enrollments, student analytics, notifications, quizzes/question types and essay grading, assignments/submissions/manual grading, and instructor student-performance analytics.
- `CourseVideoRecorder` already captured browser camera recordings and uploaded private files; `CourseVideoLibrary` already provided student playback through short-lived, course-scoped playback tokens and byte-range streaming.
- LiveKit class scheduling, token issuance, role-limited publishing, classroom UI, collaboration, attendance, and notifications already exist. Those implementations (including the in-progress collaboration edits) were retained.

Important schema finding: the bootstrap assignment schema used `instructions`, `max_score`, `file_url`, and `score`, while current assignment/analytics controllers use `description`, `max_points`, `submission_url`, and `grade`. The correction migration now avoids creating an index on the not-yet-renamed grade field; the new alignment migration safely renames the legacy columns and preserves rows.

## Implemented in this change

- The instructor sidebar is grouped and expandable, has desktop collapse/mobile drawer support on the instructor dashboard, and points to implemented destinations. Its grading badge uses instructor-scoped pending work; the notification bell uses the existing real unread-count endpoint.
- Removed the dashboard’s fabricated announcement and hard-coded performance percentages. Dashboard course search/status filtering works, and dashboard metrics/activity/performance use instructor-scoped API data. Pending assignment grading now has a real owner-scoped endpoint rather than the previously missing route.
- Added an instructor agenda/calendar view backed by live-class, quiz-window, and assignment-deadline rows; it supports date range selection, event links, and a month grid. The calendar is a read-only aggregate; editing events remains in the existing course-specific quiz/assignment and live-class workflows.
- Recorded videos support local file upload as well as browser recording; WebM, MP4, and Ogg are accepted, client and server enforce the 200 MB limit, upload progress and local preview are shown, and instructors can manage title, description, course position, lesson association, visibility, and deletion.
- A recorded video can be attached to an existing course lesson and played in the course lesson viewer. Students resume their position; the backend stores progress for the authenticated, enrolled student and exposes owner-scoped per-video started/completed/average-watch analytics.
- Completion policy: the player reports position periodically and on pause/end; the server marks completion after reported playback position reaches at least 90% of the known duration. This is learning-progress telemetry, not an anti-cheat or certification proof.

## Files changed by this task

- `client/src/App.jsx`
- `client/src/components/CourseVideoLibrary.jsx`
- `client/src/components/CourseVideoRecorder.jsx`
- `client/src/components/DashboardSidebar.jsx`
- `client/src/components/NotificationBell.jsx`
- `client/src/pages/CourseContent.jsx`
- `client/src/pages/InstructorCalendar.jsx` (new)
- `client/src/pages/InstructorDashboardEnhanced.jsx`
- `database/migrations/20261024_analytics_schema_corrections.sql`
- `database/migrations/20261025_assignment_schema_alignment.sql` (new)
- `database/migrations/20261025_course_video_metadata.sql` (new)
- `database/migrations/20261025_course_video_progress.sql` (new)
- `server/src/controllers/analyticsController.js`
- `server/src/controllers/assignmentController.js`
- `server/src/controllers/courseVideoController.js`
- `server/src/routes/analyticsRoutes.js`
- `server/src/routes/assignmentRoutes.js`
- `server/src/routes/courseVideoRoutes.js`
- `server/test/courseVideos.security.test.js`
- `server/test/instructorCalendar.integration.test.js` (new)

Other modified/untracked files visible in `git status` were already present before this task (admin console/approval work and LiveKit collaboration changes) and were preserved.

## Database migrations

Run each migration once against the existing database; do **not** rerun `database/schema.sql` on an existing database and do not drop/recreate tables:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS
psql -h localhost -p 5432 -U postgres -d learnsphere_lms -f database\migrations\20261025_assignment_schema_alignment.sql
psql -h localhost -p 5432 -U postgres -d learnsphere_lms -f database\migrations\20261025_course_video_metadata.sql
psql -h localhost -p 5432 -U postgres -d learnsphere_lms -f database\migrations\20261025_course_video_progress.sql
```

The assignment alignment requires the existing base tables and the earlier schema-correction migration. Migration changes are additive or column renames that preserve existing data; rollback cautions are included in each new migration. The three new migrations were applied to the configured development database for integration validation; no reset/drop was run.

## API additions and authorization

- `GET /api/analytics/calendar?from=<ISO>&to=<ISO>` — instructor only; returns only events belonging to the authenticated instructor’s courses, with a maximum 366-day range.
- `GET /api/assignments/submissions/pending?limit=10` — instructor sees only own course submissions; admin may review platform-wide; other roles receive 403.
- `GET /api/course-videos/:id/progress` and `PATCH /api/course-videos/:id/progress` — students only; access is checked against active/completed enrollment and published-video visibility; student identity always comes from verified JWT context.
- `GET /api/course-videos/courses/:courseId/analytics` — owner instructor or admin; returns enrollment, starts, completions, completion percent, and average watch percent from stored progress.
- Existing video endpoints remain: `POST /api/course-videos/courses/:courseId`, `POST /api/course-videos/:id/playback`, `GET /api/course-videos/:id/stream`, `PUT /api/course-videos/:id`, and draft publish/delete routes. Upload and playback continue to use random server filenames, local private storage, signed short-lived playback URLs, and byte-range streaming.

## Video and LiveKit setup

Recorded files are stored under `server/storage/course-videos/`, outside the public static path. Ensure the server process can write to that folder and that the deployment has sufficient disk capacity and backup/cleanup policy. Current upload size is 200 MB; accepted MIME types are `video/webm`, `video/mp4`, and `video/ogg`. This is local filesystem storage, not object storage/CDN/transcoding.

Set server environment variables using `server/.env.example` as the template; do not commit secrets:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `CLIENT_URL`
- `JWT_SECRET` (at least 32 random characters; 64 is recommended)
- `LIVEKIT_URL` (`wss://...`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Frontend: `VITE_API_URL` in `client/.env` (defaults to `http://localhost:5000/api`)

LiveKit media requires valid server credentials and working browser camera/microphone permissions. The integration/security tests issue scoped tokens but do not verify a real external LiveKit room with multiple real devices/participants. Live-class Egress/recording is not configured or implemented here; do not promise automatic class recordings.

## Windows commands

Use existing package scripts; no script/dependency was added:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
npm install
npm run dev
```

In a second CMD window:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\client
npm install
npm run dev
```

Validation:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
npm test
```

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\client
npm test
npm run lint
npm run build
```

## Validation results

- Frontend production build: **passed** (Vite reported its existing large-chunk advisory: main chunk is over 500 kB).
- Frontend unit tests: **5 passed**.
- Changed instructor UI files: focused ESLint **passed**; `CourseContent.jsx` passed when suppressing its pre-existing `react-hooks/set-state-in-effect` finding.
- Backend recorded-video and calendar/grading-queue integration tests: **12 passed**.
- Full backend suite after migrations: **66 passed; 2 test cases failed** (nested suite accounting reports 4 failures). Existing failures unrelated to these changes: `adminUsers.security.test.js` expects a target user in the recent-users result, and the in-progress live-class collaboration test receives PostgreSQL `inconsistent types deduced for parameter $3`.
- Full frontend `npm run lint`: **fails on existing repository lint debt** (44 errors across unrelated files, including existing effect-triggered state updates, unused imports/variables, and a random metric in the student dashboard). No such errors were reported for the focused instructor/dashboard files.

## Remaining gaps / external limits

- Instructor messaging/inbox, editable course-announcement workflow, profile/settings and password-change pages, and a reusable question-bank feature do not exist in the current product and were not fabricated in this task.
- Calendar events are aggregated/read-only; the existing domain forms remain responsible for edits/cancellation.
- LiveKit must be configured and tested in the target environment. External recording/Egress, recording consent/status/retention, and protected live-session recording playback are not configured.
- Recorded uploads use local disk. Cloud object storage, resumable upload, transcoding, captions, and signed CDN delivery require an explicitly configured provider.
- The overall linter and two unrelated backend regression cases remain failing as reported above.
