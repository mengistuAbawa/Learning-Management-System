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
