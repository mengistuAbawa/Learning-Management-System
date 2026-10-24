# Live classroom — Phase 1

## Architecture

The classroom uses LiveKit Cloud for the managed WebRTC SFU and the official
`livekit-client` browser SDK. This keeps media routing, NAT traversal, and
regional scaling out of the LMS while still using real camera, microphone, and
screen-share tracks. Self-hosting LiveKit remains possible, but requires
operating the SFU, HTTPS/WSS, TURN/network traversal, monitoring, upgrades, and
capacity planning.

The API signs short-lived room tokens after checking the current database user,
course owner, enrollment, class status, and join window. API credentials and
token signing remain on the server. Instructor tokens can moderate their room
and publish screen sharing; enrolled students can publish only camera and
microphone. Participant data publishing is disabled: chat and hand-raise events
are validated and rate-limited by the authenticated API before the server relays
them through LiveKit.

LiveKit Cloud requires a project URL, API key, and API secret. Configure them
only in `server/.env`:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

The project URL must use `wss://`. Never use a `VITE_` prefix for the API secret.
Consult [LiveKit Cloud pricing](https://livekit.com/pricing) for current usage
rates and plan limits; pricing can change. Browser camera and microphone access
requires user permission and a secure context (localhost is allowed for local
development; deployed sites need HTTPS).

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
camera/microphone permissions to test media and screen sharing. The automated
tests use local signing credentials only; they do not connect to LiveKit Cloud.

## Phase 1 scope and limitations

Implemented: class scheduling, instructor/course ownership checks, student
class listings based on active/completed enrollment, start/cancel, short-lived
room-token issuance, LiveKit video/audio participant tiles, microphone/camera
controls, instructor screen share, reconnect status, LiveKit-relayed live chat,
hand raising, and leave/end controls. Chat is ephemeral and is not retained for
participants who join later; raised-hand state is currently limited to events
observed during a participant's connection. The API limits classroom actions
to 12 requests per minute per client IP. All class timestamps are stored as
PostgreSQL `TIMESTAMPTZ`; the schedule form submits an offset-aware timestamp
and displays it in the viewer's local zone.

Not yet implemented: rescheduling UI, persistent attendance/provider webhooks,
polls/quizzes, collaborative whiteboard, reminders, recording, and
attendance/reporting views. No recording is enabled. Do not count a
client-side join action as verified attendance. These require their own schema,
authorization, and integration tests before being represented as available
classroom controls.

The room is created by LiveKit when the first valid participant connects. Real
media exchange cannot be validated until a valid project is configured and
tested from two permitted accounts and supported browsers.
