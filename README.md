# Learning-Management-System
A Learning Management System (LMS) is a software platform to create, deliver, and track learning. It helps educators manage courses, assignments, and assessments, while learners can access content anytime, monitor progress, and collaborate online efficiently.

## Instructor course video recordings

Instructors can record a lesson from the instructor dashboard and upload it to a course they own. After recording, **Save draft** keeps it instructor-only; **Send to students** publishes it to active and completed enrollees. Saved drafts can be sent later from the instructor's recordings list. Recordings are stored privately under `server/storage/course-videos` and are not served as public static files. The API accepts WebM, MP4, and Ogg recordings up to 200 MB per upload, with a limit of 10 uploads per 15 minutes from one IP address. Use HTTPS outside localhost so browsers permit camera and microphone access.

Students with an active or completed enrollment in the selected course can list and play its recordings. The server issues video-scoped playback links that expire after four hours and checks the viewer's current account and enrollment permissions on every stream/range request. Administrators and the course instructor can also access recordings. Back up the private storage directory along with the PostgreSQL database; deleting a database row does not automatically reclaim its associated file.

Apply the additive video migrations from the repository root using Windows CMD:

```cmd
cd server
node scripts\apply-migration.js ..\database\migrations\20261024_course_videos.sql
node scripts\apply-migration.js ..\database\migrations\20261024_course_video_status.sql
```

## Student registration approval

Public student registrations remain pending until an administrator approves them.
Existing accounts remain approved by the additive migration, while account activation
continues to be controlled separately by `is_active`. Pending registrations can be
reviewed from the administrator dashboard; students can sign in after approval.

Apply the migration from Windows CMD before starting the updated backend:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
node scripts\apply-migration.js ..\database\migrations\20261025_student_approval.sql
```

## Administrator platform APIs

Instructor applicants can submit an application through `POST /api/auth/instructors/apply`.
Administrators review applications through `GET /api/users/students/pending`,
`GET /api/users/instructors/pending`, and the corresponding
`PATCH /api/users/{students|instructors}/:id/approval` endpoints. Approved applicants
can sign in; rejected or pending applicants cannot access protected APIs. Administrator
platform endpoints under `/api/admin` provide announcement management and
audience-specific published announcements, a restricted allowlist of platform settings,
system health checks, and audit records for successful administrator write actions.
Existing account suspension remains managed separately through the user status endpoint.
Managed course categories can be renamed or removed through
`PUT`/`DELETE /api/courses/categories/:name`; deletion is rejected while courses still
use that category.
Administrators can open a paginated, role-filtered account directory through
`GET /api/users/accounts?role=student|instructor`. General settings include platform
name, support email, and public registration access; localization settings allow
English, Amharic, Spanish, or French and a validated IANA time zone. Integration
credentials are intentionally not managed through this API.

Apply the admin-platform schema migration before starting the updated backend:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
node scripts\apply-migration.js sql\step14_admin_platform.sql
```

## Advanced administrator dashboard

The administrator workspace adds role-protected, PostgreSQL-backed directory,
analytics, enrollment, approval, announcement, health, audit, category, and
settings views. Apply the additive dashboard migration **after** the
admin-platform migration above; it adds category descriptions, application
decision metadata, announcement-to-notification references, and query indexes.
It does not drop or reset existing data.

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
node scripts\apply-migration.js ..\database\migrations\20261025_admin_console.sql
```

Administrator reporting endpoints require an authenticated `admin` role:

- `GET /api/admin/dashboard/overview`
- `GET /api/admin/dashboard/analytics?months=3|6|12|24`
- `GET /api/admin/dashboard/approvals?page=1&limit=20`
- `GET /api/admin/dashboard/people/student|instructor?page=1&limit=20`
- `GET /api/admin/dashboard/courses` and `/api/admin/dashboard/enrollments`
- `GET /api/admin/health` and paginated `GET /api/admin/audit-logs`

Search/filter query values are validated and SQL is parameterized. Instructor
and student approval decisions retain the decision timestamp, administrator,
and optional rejection reason. Publishing an announcement creates in-app
notifications for active, approved users in its audience; email/push delivery
and scheduled publishing are not configured. Course archiving preserves
enrollment and course records.

## LiveKit virtual classrooms

Install the live classroom schema from the repository root using Windows CMD:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
node scripts\migrate-live-classes.js
```

Configure `LIVEKIT_URL` with the project's secure `wss://` URL, along with
`LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, in the server environment. The
classroom includes LiveKit audio/video and instructor screen sharing, persisted
chat, instructor-created polls, a shared whiteboard, participant moderation,
and attendance tracking. Administrators can manage and review sessions but do
not receive classroom media tokens. Students need an active or completed course
enrollment to join.

Without valid LiveKit credentials, the API and client can be built and tested,
but an actual multi-participant classroom cannot be verified.
