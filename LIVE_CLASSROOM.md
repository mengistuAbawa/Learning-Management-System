# LearnSphere Live Classroom

## Architecture

The classroom uses LiveKit Cloud for the managed WebRTC SFU and the official
`livekit-client` browser SDK. This keeps media routing, NAT traversal, and
regional scaling out of the LMS while still using real camera, microphone, and
screen-share tracks. Self-hosting LiveKit remains possible, but requires
operating the SFU, HTTPS/WSS, TURN/network traversal, monitoring, upgrades, and
capacity planning.

The API signs short-lived room tokens after checking the current database user,
course owner, enrollment, per-session permitted-student list, class status, and
join window. API credentials and token signing remain on the server. Instructor
tokens can publish screen sharing; enrolled students can publish only camera
and microphone. Participant data publishing is disabled: chat and hand-raise
events are validated and rate-limited by the authenticated API before the
server relays them through LiveKit.

LiveKit Cloud requires a project URL, API key, and API secret. Configure them
only in `server/.env`:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

The project URL must use `wss://`. Never use a `VITE_` prefix for the API secret.
Consult [LiveKit Cloud pricing](https://livekit.com/pricing) for current usage
rates and plan limits; pricing can change. `CLIENT_URL` must be the exact
browser origin allowed by the API's CORS policy. Deployed LMS pages must use
HTTPS so browsers can access camera/microphone devices, and the LiveKit URL
must use WSS. Configure any reverse proxy/firewall to permit the LiveKit
signaling and media traffic required by your LiveKit deployment.

## Windows CMD setup

From a CMD prompt:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS
cd server
npm install
node scripts\migrate-live-classes.js
node --test test\liveClasses.security.test.js
```

Set the three `LIVEKIT_*` variables in `server\.env`, then run the API:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
npm start
```

In another CMD prompt:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\client
npm install
npm run dev
```

Create an instructor-owned course and an enrolled student, sign in as the
instructor, schedule a class from **Live classes**, and start it. Sign in as the
enrolled student in a second browser/profile and join the live class. Allow
camera/microphone permissions to test media and screen sharing. The automated tests use local signing credentials and mock the LiveKit room
service; they do not connect to LiveKit Cloud. To build the frontend:

```cmd
cd /d D:\xampp\htdocs\LearnSphere-LMS\client
npm run build
```

## Current features

Scheduling, rescheduling, cancellation, course ownership checks, selected
student allow-lists, schedule-change notifications, and student live-class
listings are supported. Sessions created before the participant migration
remain open to all enrolled students. Instructors can start/end classes,
moderate participants, and review attendance; students can view their own
attendance history. The classroom includes real LiveKit video/audio,
microphone/camera controls, instructor screen sharing, reconnect status,
persisted chat, hand raising, polls, and a shared whiteboard. Chat history is
available to authorized course participants after they leave. Raised-hand
state is ephemeral and is only known to participants who observed the event
while connected. The API limits classroom actions to 12 requests per minute
per authenticated user. All class timestamps are stored as PostgreSQL
`TIMESTAMPTZ`; the schedule form submits an offset-aware timestamp and displays
the start time in the viewer's local zone.

Attendance is recorded only after the server verifies the authenticated
participant is connected to the correct LiveKit room. The client sends a
30-second heartbeat while connected; stale heartbeats are capped at 90 seconds
when calculating duration, so a disconnected browser cannot add unlimited
time. Attendance is not based solely on a browser-submitted student ID.

No recording is enabled. LiveKit token issuance, media-device permissions,
and multi-participant media exchange require a configured LiveKit deployment
and cannot be end-to-end verified by the database integration tests.

The room is created by LiveKit when the first valid participant connects. Real
media exchange cannot be validated until a valid project is configured and
tested from two permitted accounts and supported browsers.
