const crypto = require("node:crypto");
const {
  AccessToken,
  DataPacket_Kind,
  RoomServiceClient,
  TrackSource,
} = require("livekit-server-sdk");
const { pool } = require("../config/db");
const { ownsCourse } = require("../services/courseAccess");

const INSTRUCTOR_SOURCES = [
  TrackSource.CAMERA,
  TrackSource.MICROPHONE,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];
const STUDENT_SOURCES = [TrackSource.CAMERA, TrackSource.MICROPHONE];

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function classroomError(status, message) {
  const error = new Error(message);
  error.classroomStatus = status;
  return error;
}

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function readSchedule(body) {
  const errors = [];
  const fullName = typeof body.title === "string" ? body.title.trim() : "";
  const scheduledAt = body.scheduled_at;
  const duration = Number(body.duration_minutes);
  const timeZone = typeof body.time_zone === "string" ? body.time_zone : "";

  if (fullName.length < 3 || fullName.length > 200) {
    errors.push("Title must contain between 3 and 200 characters.");
  }
  if (
    typeof scheduledAt !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(scheduledAt) ||
    !Number.isFinite(Date.parse(scheduledAt))
  ) {
    errors.push("Provide a valid scheduled date and time with a UTC offset.");
  } else if (Date.parse(scheduledAt) <= Date.now()) {
    errors.push("The scheduled time must be in the future.");
  }
  if (!Number.isInteger(duration) || duration < 5 || duration > 240) {
    errors.push("Duration must be between 5 and 240 minutes.");
  }
  if (!isValidTimeZone(timeZone)) {
    errors.push("Provide a valid IANA time zone.");
  }

  for (const field of ["description", "learning_objectives"]) {
    if (
      body[field] !== undefined &&
      (typeof body[field] !== "string" || body[field].trim().length > 4000)
    ) {
      errors.push(`${field.replace("_", " ")} must be no more than 4,000 characters.`);
    }
  }

  return {
    errors,
    data: {
      title: fullName,
      description:
        typeof body.description === "string" ? body.description.trim() : "",
      learningObjectives:
        typeof body.learning_objectives === "string"
          ? body.learning_objectives.trim()
          : "",
      scheduledAt: new Date(scheduledAt),
      duration,
      timeZone,
    },
  };
}

async function loadClass(classId) {
  const result = await pool.query(
    `SELECT lc.id, lc.course_id, lc.instructor_id, lc.title, lc.description,
            lc.learning_objectives, lc.scheduled_at, lc.duration_minutes,
            lc.time_zone, lc.room_name, lc.status, lc.started_at, lc.ended_at,
            lc.created_at, lc.whiteboard_student_editing, c.title AS course_title,
            u.full_name AS instructor_name
     FROM live_classes lc
     JOIN courses c ON c.id = lc.course_id
     JOIN users u ON u.id = lc.instructor_id
     WHERE lc.id = $1
     LIMIT 1`,
    [classId]
  );
  return result.rows[0] || null;
}

async function canAccessClass(user, liveClass) {
  if (user.role === "admin") return true;

  if (user.role === "instructor") {
    return String(liveClass.instructor_id) === String(user.id);
  }

  if (user.role !== "student") return false;

  const result = await pool.query(
    `SELECT 1
     FROM enrollments
     WHERE student_id = $1
       AND course_id = $2
       AND status IN ('active', 'completed')
     LIMIT 1`,
    [user.id, liveClass.course_id]
  );
  return result.rowCount > 0;
}

function serializeClass(liveClass, user) {
  const instructor = String(liveClass.instructor_id) === String(user.id);
  return {
    id: liveClass.id,
    course_id: liveClass.course_id,
    course_title: liveClass.course_title,
    instructor_name: liveClass.instructor_name,
    title: liveClass.title,
    description: liveClass.description,
    learning_objectives: liveClass.learning_objectives,
    scheduled_at: liveClass.scheduled_at,
    duration_minutes: liveClass.duration_minutes,
    time_zone: liveClass.time_zone,
    status: liveClass.status,
    started_at: liveClass.started_at,
    ended_at: liveClass.ended_at,
    whiteboard_student_editing: liveClass.whiteboard_student_editing,
    can_manage: instructor || user.role === "admin",
    can_join: user.role !== "admin" &&
      (liveClass.status === "live" ||
        (instructor && liveClass.status === "scheduled" &&
          Date.now() >= Date.parse(liveClass.scheduled_at) - 15 * 60 * 1000)),
  };
}

async function notifyEnrolledStudents(liveClass, event, title, message) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link_url, dedupe_key)
       SELECT e.student_id, 'live_class', $2, $3, $4, $5 || ':' || e.student_id
       FROM enrollments e
       WHERE e.course_id = $1 AND e.status IN ('active', 'completed')
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [
        liveClass.course_id,
        title,
        message,
        `/live-classes/${liveClass.id}/room`,
        `live-class:${liveClass.id}:${event}`,
      ]
    );
  } catch (error) {
    console.error("Failed to notify students about a live class:", error.message);
  }
}

async function list(req, res, next) {
  try {
    let result;
    if (req.user.role === "admin") {
      result = await pool.query(
        `SELECT lc.*, c.title AS course_title, u.full_name AS instructor_name
         FROM live_classes lc
         JOIN courses c ON c.id = lc.course_id
         JOIN users u ON u.id = lc.instructor_id
         ORDER BY lc.scheduled_at DESC
         LIMIT 100`
      );
    } else if (req.user.role === "instructor") {
      result = await pool.query(
        `SELECT lc.*, c.title AS course_title, u.full_name AS instructor_name
         FROM live_classes lc
         JOIN courses c ON c.id = lc.course_id
         JOIN users u ON u.id = lc.instructor_id
         WHERE lc.instructor_id = $1
         ORDER BY lc.scheduled_at DESC
         LIMIT 100`,
        [req.user.id]
      );
    } else {
      result = await pool.query(
        `SELECT DISTINCT lc.*, c.title AS course_title,
                u.full_name AS instructor_name
         FROM live_classes lc
         JOIN courses c ON c.id = lc.course_id
         JOIN users u ON u.id = lc.instructor_id
         JOIN enrollments e ON e.course_id = lc.course_id
         WHERE e.student_id = $1
           AND e.status IN ('active', 'completed')
           AND lc.status <> 'cancelled'
         ORDER BY lc.scheduled_at DESC
         LIMIT 100`,
        [req.user.id]
      );
    }

    return res.json({
      success: true,
      classes: result.rows.map((item) => serializeClass(item, req.user)),
    });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const courseId = Number(req.body.course_id);
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendError(res, 400, "Select a valid course.");
    }

    const { errors, data } = readSchedule(req.body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Please correct the submitted information.",
        errors: errors.map((message) => ({ message })),
      });
    }

    const course = await pool.query(
      `SELECT id, instructor_id, title
       FROM courses
       WHERE id = $1`,
      [courseId]
    );
    if (!course.rowCount) return sendError(res, 404, "Course not found.");
    if (!ownsCourse(req.user, course.rows[0])) {
      return sendError(res, 403, "You may only schedule classes for courses you manage.");
    }

    const result = await pool.query(
      `INSERT INTO live_classes
         (course_id, instructor_id, title, description, learning_objectives,
          scheduled_at, duration_minutes, time_zone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        courseId,
        req.user.id,
        data.title,
        data.description,
        data.learningObjectives,
        data.scheduledAt,
        data.duration,
        data.timeZone,
      ]
    );

    const liveClass = await loadClass(result.rows[0].id);
    await notifyEnrolledStudents(
      liveClass,
      `scheduled:${new Date(liveClass.scheduled_at).toISOString()}`,
      "Live class scheduled",
      `"${liveClass.title}" has been scheduled.`
    );
    return res.status(201).json({
      success: true,
      live_class: serializeClass(liveClass, req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }

    return res.json({
      success: true,
      live_class: serializeClass(liveClass, req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (
      !["instructor", "admin"].includes(req.user.role) ||
      (req.user.role === "instructor" &&
        String(req.user.id) !== String(liveClass.instructor_id))
    ) {
      return sendError(res, 403, "You may only manage classes you teach.");
    }
    if (liveClass.status !== "scheduled") {
      return sendError(res, 409, "Only scheduled classes can be changed.");
    }

    const { errors, data } = readSchedule(req.body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Please correct the submitted information.",
        errors: errors.map((message) => ({ message })),
      });
    }

    await pool.query(
      `UPDATE live_classes
       SET title = $2, description = $3, learning_objectives = $4,
           scheduled_at = $5, duration_minutes = $6, time_zone = $7,
           updated_at = NOW()
       WHERE id = $1`,
      [
        liveClass.id,
        data.title,
        data.description,
        data.learningObjectives,
        data.scheduledAt,
        data.duration,
        data.timeZone,
      ]
    );
    await notifyEnrolledStudents(
      liveClass,
      `rescheduled:${data.scheduledAt.toISOString()}`,
      "Live class updated",
      `"${data.title}" has been rescheduled.`
    );
    return res.json({
      success: true,
      live_class: serializeClass(await loadClass(liveClass.id), req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function changeStatus(req, res, status, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (
      !["instructor", "admin"].includes(req.user.role) ||
      (req.user.role === "instructor" &&
        String(req.user.id) !== String(liveClass.instructor_id))
    ) {
      return sendError(res, 403, "You may only manage classes you teach.");
    }

    if (status === "live") {
      const startableAt = Date.parse(liveClass.scheduled_at) - 15 * 60 * 1000;
      if (
        liveClass.status !== "scheduled" ||
        Date.now() < startableAt
      ) {
        return sendError(
          res,
          409,
          "The class can be started up to 15 minutes before its scheduled time."
        );
      }
      const update = await pool.query(
        `UPDATE live_classes
         SET status = 'live', started_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'scheduled'`,
        [liveClass.id]
      );
      if (!update.rowCount) {
        return sendError(res, 409, "This class has already been started.");
      }
      await notifyEnrolledStudents(
        liveClass,
        "started",
        "Live class is starting",
        `"${liveClass.title}" is now live.`
      );
    } else if (status === "cancelled") {
      if (liveClass.status !== "scheduled") {
        return sendError(res, 409, "Only scheduled classes can be cancelled.");
      }
      await pool.query(
        `UPDATE live_classes SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND status = 'scheduled'`,
        [liveClass.id]
      );
      await notifyEnrolledStudents(
        liveClass,
        "cancelled",
        "Live class cancelled",
        `"${liveClass.title}" has been cancelled.`
      );
    } else {
      if (liveClass.status !== "live") {
        return sendError(res, 409, "Only live classes can be ended.");
      }

      const liveKitUrl = process.env.LIVEKIT_URL;
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!liveKitUrl || !apiKey || !apiSecret) {
        return sendError(res, 503, "Live video is not configured.");
      }

      const providerUrl = new URL(liveKitUrl);
      if (providerUrl.protocol !== "wss:") {
        return sendError(res, 503, "LIVEKIT_URL must use the secure wss:// protocol.");
      }
      providerUrl.protocol = "https:";
      const roomService = new RoomServiceClient(
        providerUrl.toString(),
        apiKey,
        apiSecret
      );
      const roomName = `learnsphere-${liveClass.room_name}`;
      const activeRooms = await roomService.listRooms([roomName]);
      if (activeRooms.some((room) => room.name === roomName)) {
        await roomService.deleteRoom(roomName);
      }

      await pool.query(
        `UPDATE live_classes
         SET status = 'ended', ended_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'live'`,
        [liveClass.id]
      );
      await notifyEnrolledStudents(
        liveClass,
        "ended",
        "Live class ended",
        `"${liveClass.title}" has ended.`
      );
    }

    return res.json({
      success: true,
      live_class: serializeClass(await loadClass(liveClass.id), req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function start(req, res, next) {
  return changeStatus(req, res, "live", next);
}

async function end(req, res, next) {
  return changeStatus(req, res, "ended", next);
}

async function cancel(req, res, next) {
  return changeStatus(req, res, "cancelled", next);
}

async function issueToken(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (req.user.role === "admin") {
      return sendError(res, 403, "Administrators may review sessions but cannot join classroom media.");
    }
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }

    const isInstructor =
      req.user.role === "instructor" &&
      String(req.user.id) === String(liveClass.instructor_id);
    if (
      liveClass.status !== "live" &&
      !(isInstructor &&
        liveClass.status === "scheduled" &&
        Date.now() >=
          Date.parse(liveClass.scheduled_at) - 15 * 60 * 1000)
    ) {
      return sendError(res, 409, "This class is not currently open for joining.");
    }
    if (
      liveClass.status === "live" &&
      Date.now() >=
        Date.parse(liveClass.started_at || liveClass.scheduled_at) +
          Number(liveClass.duration_minutes) * 60 * 1000
    ) {
      await pool.query(
        `UPDATE live_classes
         SET status = 'ended', ended_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'live'`,
        [liveClass.id]
      );
      return sendError(res, 409, "The scheduled class duration has ended.");
    }

    const liveKitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!liveKitUrl || !apiKey || !apiSecret) {
      return sendError(
        res,
        503,
        "Live video is not configured. Set the LiveKit server environment variables."
      );
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(liveKitUrl);
    } catch {
      return sendError(res, 503, "The LiveKit server URL is invalid.");
    }
    if (parsedUrl.protocol !== "wss:") {
      return sendError(res, 503, "LIVEKIT_URL must use the secure wss:// protocol.");
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: `user-${req.user.id}`,
      name: req.user.full_name,
      ttl: "10m",
      metadata: JSON.stringify({ role: isInstructor ? "instructor" : "student" }),
    });
    token.addGrant({
      roomJoin: true,
      room: `learnsphere-${liveClass.room_name}`,
      canPublish: true,
      canPublishSources: isInstructor ? INSTRUCTOR_SOURCES : STUDENT_SOURCES,
      canSubscribe: true,
      canPublishData: false,
      roomAdmin: isInstructor,
    });

    return res.json({
      success: true,
      token: await token.toJwt(),
      url: liveKitUrl,
      live_class: serializeClass(liveClass, req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function getRoomContext(liveClass, userId) {
  const liveKitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!liveKitUrl || !apiKey || !apiSecret) {
    throw classroomError(503, "Live video is not configured.");
  }

  let providerUrl;
  try {
    providerUrl = new URL(liveKitUrl);
  } catch {
    throw classroomError(503, "Live video is not configured correctly.");
  }
  if (providerUrl.protocol !== "wss:") {
    throw classroomError(503, "Live video must use a secure wss:// URL.");
  }
  providerUrl.protocol = "https:";

  const roomName = `learnsphere-${liveClass.room_name}`;
  const roomService = new RoomServiceClient(
    providerUrl.toString(),
    apiKey,
    apiSecret
  );
  const participants = await roomService.listParticipants(roomName);
  const identity = `user-${userId}`;
  if (!participants.some((participant) => participant.identity === identity)) {
    throw classroomError(409, "The live classroom is not connected.");
  }
  return { roomService, roomName };
}

async function publishRoomEvent(liveClass, userId, event, context) {
  const { roomService, roomName } =
    context || await getRoomContext(liveClass, userId);
  await roomService.sendData(
    roomName,
    Buffer.from(JSON.stringify(event)),
    DataPacket_Kind.RELIABLE,
    { topic: "learnsphere-classroom" }
  );
}

async function sendChat(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }
    if (liveClass.status !== "live") {
      return sendError(res, 409, "Chat is available only during a live class.");
    }

    const message =
      typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > 500) {
      return sendError(res, 400, "Chat messages must contain 1–500 characters.");
    }

    const event = {
      type: "chat",
      message: {
        id: crypto.randomUUID(),
        user_id: String(req.user.id),
        participant_name: req.user.full_name,
        role: req.user.role,
        text: message,
        sent_at: new Date().toISOString(),
      },
    };
    const roomContext = await getRoomContext(liveClass, req.user.id);
    const saved = await pool.query(
      `INSERT INTO live_class_chat_messages (id, live_class_id, user_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING created_at`,
      [event.message.id, liveClass.id, req.user.id, message]
    );
    event.message.sent_at = saved.rows[0].created_at;
    await publishRoomEvent(liveClass, req.user.id, event, roomContext);
    return res.status(201).json({ success: true, message: event.message });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

async function getChatHistory(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }

    const result = await pool.query(
      `SELECT m.id, m.user_id, u.full_name AS participant_name, u.role,
              m.message AS text, m.created_at AS sent_at
       FROM live_class_chat_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.live_class_id = $1
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 100`,
      [liveClass.id]
    );
    return res.json({ success: true, messages: result.rows.reverse() });
  } catch (error) {
    next(error);
  }
}

async function requireLiveClass(req, res) {
  const liveClass = await loadClass(req.params.id);
  if (!liveClass) {
    sendError(res, 404, "Live class not found.");
    return null;
  }
  if (!(await canAccessClass(req.user, liveClass))) {
    sendError(res, 403, "You are not enrolled in this course.");
    return null;
  }
  if (req.user.role === "admin") {
    sendError(res, 403, "Administrators may review sessions but cannot participate in classroom activities.");
    return null;
  }
  if (liveClass.status !== "live") {
    sendError(res, 409, "This action is available only during a live class.");
    return null;
  }
  return liveClass;
}

function isClassInstructor(user, liveClass) {
  return user.role === "instructor" &&
    String(user.id) === String(liveClass.instructor_id);
}

function createRoomService() {
  const liveKitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!liveKitUrl || !apiKey || !apiSecret) {
    throw classroomError(503, "Live video is not configured.");
  }

  let providerUrl;
  try {
    providerUrl = new URL(liveKitUrl);
  } catch {
    throw classroomError(503, "Live video is not configured correctly.");
  }
  if (providerUrl.protocol !== "wss:") {
    throw classroomError(503, "Live video must use a secure wss:// URL.");
  }
  providerUrl.protocol = "https:";
  return new RoomServiceClient(providerUrl.toString(), apiKey, apiSecret);
}

async function listParticipants(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }
    if (liveClass.status !== "live") {
      return res.json({ success: true, participants: [] });
    }
    const roomService = createRoomService();
    const participants = await roomService.listParticipants(
      `learnsphere-${liveClass.room_name}`
    );
    const identities = participants
      .map((participant) => participant.identity)
      .filter((identity) => /^user-[1-9]\d*$/.test(identity))
      .map((identity) => identity.slice(5));
    if (!identities.length) {
      return res.json({ success: true, participants: [] });
    }
    const attendance = await pool.query(
      `SELECT u.id, u.full_name, u.role, a.join_count, a.total_duration_seconds,
              a.first_joined_at, a.last_joined_at
       FROM users u
       LEFT JOIN live_class_attendance a
         ON a.user_id = u.id AND a.live_class_id = $2
       WHERE u.id = ANY($1::bigint[])`,
      [identities, liveClass.id]
    );
    const byId = new Map(attendance.rows.map((row) => [String(row.id), row]));
    return res.json({
      success: true,
      participants: identities
        .map((id) => byId.get(id))
        .filter(Boolean),
    });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

async function moderateParticipant(req, res, next, action) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!isClassInstructor(req.user, liveClass)) {
      return sendError(res, 403, "Only the class instructor may moderate participants.");
    }
    if (liveClass.status !== "live") {
      return sendError(res, 409, "Participants can be moderated only during a live class.");
    }
    const participantId = Number(req.params.participantId);
    if (participantId === Number(liveClass.instructor_id)) {
      return sendError(res, 400, "The instructor cannot moderate their own connection.");
    }
    const roomService = createRoomService();
    const roomName = `learnsphere-${liveClass.room_name}`;
    const identity = `user-${participantId}`;
    const participants = await roomService.listParticipants(roomName);
    if (!participants.some((participant) => participant.identity === identity)) {
      return sendError(res, 404, "Participant is no longer connected.");
    }

    if (action === "remove") {
      await roomService.removeParticipant(roomName, identity);
    } else {
      const participant = participants.find((item) => item.identity === identity);
      const audioTracks = (participant.tracks || []).filter(
        (track) => track.source === TrackSource.MICROPHONE
      );
      if (!audioTracks.length) {
        return sendError(res, 409, "The participant has no published microphone track.");
      }
      for (const track of audioTracks) {
        await roomService.mutePublishedTrack(
          roomName,
          identity,
          track.sid || track.trackSid,
          true
        );
      }
    }
    return res.json({ success: true });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

async function muteParticipant(req, res, next) {
  return moderateParticipant(req, res, next, "mute");
}

async function removeParticipant(req, res, next) {
  return moderateParticipant(req, res, next, "remove");
}

async function getPolls(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }
    const result = await pool.query(
      `SELECT p.id, p.question, p.options, p.status, p.anonymous,
              p.results_released, p.created_at, p.closed_at,
              mine.option_index AS my_option_index,
              CASE WHEN $2 OR p.results_released OR p.status = 'closed'
                THEN COALESCE(counts.votes, ARRAY[]::bigint[])
                ELSE NULL
              END AS vote_counts
       FROM live_class_polls p
       LEFT JOIN live_class_poll_responses mine
         ON mine.poll_id = p.id AND mine.user_id = $3
       LEFT JOIN LATERAL (
         SELECT array_agg(COALESCE(counted.votes, 0) ORDER BY option_index) AS votes
         FROM generate_series(0, cardinality(p.options) - 1) AS option_index
         LEFT JOIN (
           SELECT option_index AS option_number, count(*) AS votes
           FROM live_class_poll_responses
           WHERE poll_id = p.id
           GROUP BY option_index
         ) counted ON counted.option_number = option_index
       ) counts ON TRUE
       WHERE p.live_class_id = $1
       ORDER BY p.created_at DESC`,
      [liveClass.id, isClassInstructor(req.user, liveClass), req.user.id]
    );
    return res.json({ success: true, polls: result.rows });
  } catch (error) {
    next(error);
  }
}

async function createPoll(req, res, next) {
  try {
    const liveClass = await requireLiveClass(req, res);
    if (!liveClass) return;
    if (!isClassInstructor(req.user, liveClass)) {
      return sendError(res, 403, "Only the class instructor may create polls.");
    }
    const question = typeof req.body.question === "string" ? req.body.question.trim() : "";
    const options = Array.isArray(req.body.options)
      ? req.body.options.map((option) => typeof option === "string" ? option.trim() : "")
      : [];
    if (
      question.length < 3 || question.length > 500 ||
      options.length < 2 || options.length > 10 ||
      options.some((option) => !option || option.length > 200) ||
      new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length
    ) {
      return sendError(res, 400, "Provide a question and 2–10 distinct answer options.");
    }
    const roomContext = await getRoomContext(liveClass, req.user.id);
    const result = await pool.query(
      `INSERT INTO live_class_polls
         (live_class_id, created_by, question, options, anonymous)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, question, options, status, anonymous, results_released,
                 created_at, closed_at`,
      [liveClass.id, req.user.id, question, options, req.body.anonymous === true]
    );
    const poll = result.rows[0];
    await publishRoomEvent(liveClass, req.user.id, { type: "poll", poll }, roomContext);
    return res.status(201).json({ success: true, poll });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

async function updatePoll(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!isClassInstructor(req.user, liveClass)) {
      return sendError(res, 403, "Only the class instructor may manage polls.");
    }
    if (liveClass.status !== "live") {
      return sendError(res, 409, "Polls may be managed only during a live class.");
    }
    const status = req.body.status;
    if (!["open", "closed"].includes(status)) {
      return sendError(res, 400, "Poll status must be open or closed.");
    }
    const roomContext = await getRoomContext(liveClass, req.user.id);
    const result = await pool.query(
      `UPDATE live_class_polls
       SET status = $3::varchar,
           closed_at = CASE WHEN $3::varchar = 'closed' THEN NOW() ELSE NULL END,
           results_released = CASE WHEN $3::varchar = 'closed' THEN TRUE ELSE FALSE END
       WHERE id = $1 AND live_class_id = $2
       RETURNING id, question, options, status, anonymous, results_released,
                 created_at, closed_at`,
      [req.params.pollId, liveClass.id, status]
    );
    if (!result.rowCount) return sendError(res, 404, "Poll not found.");
    await publishRoomEvent(liveClass, req.user.id, {
      type: "poll",
      poll: result.rows[0],
    }, roomContext);
    return res.json({ success: true, poll: result.rows[0] });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

async function votePoll(req, res, next) {
  try {
    const liveClass = await requireLiveClass(req, res);
    if (!liveClass) return;
    const optionIndex = Number(req.body.option_index);
    if (!Number.isInteger(optionIndex) || optionIndex < 0) {
      return sendError(res, 400, "Select a valid poll option.");
    }
    const roomContext = await getRoomContext(liveClass, req.user.id);
    const result = await pool.query(
      `INSERT INTO live_class_poll_responses (poll_id, user_id, option_index)
       SELECT p.id, $3, $4::smallint
       FROM live_class_polls p
       WHERE p.id = $1 AND p.live_class_id = $2 AND p.status = 'open'
         AND $4::integer < cardinality(p.options)
       ON CONFLICT (poll_id, user_id) DO NOTHING
       RETURNING poll_id`,
      [req.params.pollId, liveClass.id, req.user.id, optionIndex]
    );
    if (!result.rowCount) {
      return sendError(res, 409, "The poll is closed, the option is invalid, or you have already voted.");
    }
    const pollResult = await pool.query(
      `SELECT id, question, options, status, anonymous, results_released
       FROM live_class_polls WHERE id = $1`,
      [req.params.pollId]
    );
    await publishRoomEvent(liveClass, req.user.id, {
      type: "poll-vote",
      poll_id: Number(req.params.pollId),
    }, roomContext);
    return res.status(201).json({ success: true, poll: pollResult.rows[0] });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

function validStroke(stroke) {
  return stroke && typeof stroke === "object" &&
    typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color) &&
    Number.isFinite(stroke.width) && stroke.width >= 1 && stroke.width <= 20 &&
    Array.isArray(stroke.points) && stroke.points.length >= 2 &&
    stroke.points.length <= 500 &&
    stroke.points.every((point) => point &&
      Number.isFinite(point.x) && point.x >= 0 && point.x <= 1000 &&
      Number.isFinite(point.y) && point.y >= 0 && point.y <= 600);
}

async function getWhiteboard(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }
    const result = await pool.query(
      `SELECT id, event_type, payload, user_id, created_at
       FROM (
         SELECT id, event_type, payload, user_id, created_at
         FROM live_class_whiteboard_events
         WHERE live_class_id = $1
           AND id > COALESCE((
             SELECT id FROM live_class_whiteboard_events
             WHERE live_class_id = $1 AND event_type = 'clear'
             ORDER BY id DESC LIMIT 1
           ), 0)
         ORDER BY id DESC
         LIMIT 1000
       ) recent_events
       ORDER BY id`,
      [liveClass.id]
    );
    return res.json({
      success: true,
      events: result.rows,
      student_editing: liveClass.whiteboard_student_editing,
    });
  } catch (error) {
    next(error);
  }
}

async function createWhiteboardEvent(req, res, next) {
  try {
    const liveClass = await requireLiveClass(req, res);
    if (!liveClass) return;
    const instructor = isClassInstructor(req.user, liveClass);
    if (!instructor && !liveClass.whiteboard_student_editing) {
      return sendError(res, 403, "The instructor has disabled student whiteboard editing.");
    }
    const eventType = req.body.event_type;
    if (eventType === "clear") {
      if (!instructor) return sendError(res, 403, "Only the instructor may clear the whiteboard.");
    } else if (eventType !== "stroke" || !validStroke(req.body.payload)) {
      return sendError(res, 400, "Provide a valid whiteboard stroke.");
    }
    const roomContext = await getRoomContext(liveClass, req.user.id);
    const result = await pool.query(
      `INSERT INTO live_class_whiteboard_events
         (live_class_id, user_id, event_type, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING id, event_type, payload, user_id, created_at`,
      [
        liveClass.id,
        req.user.id,
        eventType,
        eventType === "clear" ? {} : req.body.payload,
      ]
    );
    await publishRoomEvent(liveClass, req.user.id, {
      type: "whiteboard",
      whiteboard_event: result.rows[0],
    }, roomContext);
    return res.status(201).json({ success: true, event: result.rows[0] });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

async function updateWhiteboardPermission(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!isClassInstructor(req.user, liveClass)) {
      return sendError(res, 403, "Only the class instructor may change whiteboard permissions.");
    }
    if (typeof req.body.student_editing !== "boolean") {
      return sendError(res, 400, "student_editing must be a boolean.");
    }
    await pool.query(
      `UPDATE live_classes SET whiteboard_student_editing = $2, updated_at = NOW()
       WHERE id = $1`,
      [liveClass.id, req.body.student_editing]
    );
    return res.json({ success: true, student_editing: req.body.student_editing });
  } catch (error) {
    next(error);
  }
}

async function updateAttendance(req, res, next, action) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }
    if (req.user.role === "admin") {
      return sendError(res, 403, "Administrators cannot join classroom attendance.");
    }
    if (action === "join") {
      if (liveClass.status !== "live") {
        return sendError(res, 409, "This action is available only during a live class.");
      }
      const roomService = createRoomService();
      const participants = await roomService.listParticipants(
        `learnsphere-${liveClass.room_name}`
      );
      if (!participants.some((participant) => participant.identity === `user-${req.user.id}`)) {
        return sendError(res, 409, "Connect to the live classroom before recording attendance.");
      }
      await pool.query(
        `INSERT INTO live_class_attendance
           (live_class_id, user_id, connected_since, last_heartbeat_at, join_count)
         VALUES ($1, $2, NOW(), NOW(), 1)
         ON CONFLICT (live_class_id, user_id) DO UPDATE
         SET total_duration_seconds = live_class_attendance.total_duration_seconds +
               CASE
                 WHEN live_class_attendance.connected_since IS NOT NULL
                   AND live_class_attendance.last_heartbeat_at <= NOW() - INTERVAL '90 seconds'
                 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                   LEAST(NOW(), live_class_attendance.last_heartbeat_at + INTERVAL '90 seconds')
                     - live_class_attendance.connected_since
                 )))::INTEGER)
                 ELSE 0
               END,
             last_joined_at = CASE
               WHEN live_class_attendance.connected_since IS NULL
                 OR live_class_attendance.last_heartbeat_at <= NOW() - INTERVAL '90 seconds'
               THEN NOW() ELSE live_class_attendance.last_joined_at END,
             connected_since = CASE
               WHEN live_class_attendance.connected_since IS NULL
                 OR live_class_attendance.last_heartbeat_at <= NOW() - INTERVAL '90 seconds'
               THEN NOW() ELSE live_class_attendance.connected_since END,
             last_heartbeat_at = NOW(),
             join_count = live_class_attendance.join_count +
               CASE
                 WHEN live_class_attendance.connected_since IS NULL
                   OR live_class_attendance.last_heartbeat_at <= NOW() - INTERVAL '90 seconds'
                 THEN 1 ELSE 0
               END`,
        [liveClass.id, req.user.id]
      );
    } else {
      await pool.query(
        `UPDATE live_class_attendance
         SET total_duration_seconds = total_duration_seconds +
               GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                 LEAST(NOW(), COALESCE(last_heartbeat_at + INTERVAL '90 seconds', NOW()))
                   - connected_since
               )))::INTEGER),
             last_left_at = NOW(), connected_since = NULL, last_heartbeat_at = NULL
         WHERE live_class_id = $1 AND user_id = $2 AND connected_since IS NOT NULL`,
        [liveClass.id, req.user.id]
      );
    }
    return res.json({ success: true });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

async function joinAttendance(req, res, next) {
  return updateAttendance(req, res, next, "join");
}

async function leaveAttendance(req, res, next) {
  return updateAttendance(req, res, next, "leave");
}

async function getAttendance(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!isClassInstructor(req.user, liveClass) && req.user.role !== "admin") {
      return sendError(res, 403, "Only the instructor or an administrator may view attendance.");
    }
    const result = await pool.query(
      `SELECT a.user_id, u.full_name, u.email, a.first_joined_at,
              a.last_joined_at, a.last_left_at, a.join_count,
              a.total_duration_seconds +
                CASE WHEN a.connected_since IS NULL OR a.last_heartbeat_at IS NULL THEN 0
                     ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                       LEAST(NOW(), a.last_heartbeat_at + INTERVAL '90 seconds') - a.connected_since
                     )))::INTEGER)
                END AS total_duration_seconds,
              (a.connected_since IS NOT NULL
                AND a.last_heartbeat_at > NOW() - INTERVAL '90 seconds') AS connected
       FROM live_class_attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.live_class_id = $1
       ORDER BY a.first_joined_at`,
      [liveClass.id]
    );
    return res.json({ success: true, attendance: result.rows });
  } catch (error) {
    next(error);
  }
}

async function raiseHand(req, res, next) {
  try {
    const liveClass = await loadClass(req.params.id);
    if (!liveClass) return sendError(res, 404, "Live class not found.");
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }
    if (liveClass.status !== "live") {
      return sendError(res, 409, "Hand raising is available only during a live class.");
    }

    const raised = req.body.raised === true;

    await publishRoomEvent(liveClass, req.user.id, {
      type: "hand",
      user_id: String(req.user.id),
      participant_name: req.user.full_name,
      role: req.user.role,
      raised,
      sent_at: new Date().toISOString(),
    });
    return res.status(202).json({ success: true, raised });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
    next(error);
  }
}

module.exports = {
  list,
  create,
  getById,
  update,
  start,
  end,
  cancel,
  issueToken,
  sendChat,
  getChatHistory,
  raiseHand,
  listParticipants,
  muteParticipant,
  removeParticipant,
  getPolls,
  createPoll,
  updatePoll,
  votePoll,
  getWhiteboard,
  createWhiteboardEvent,
  updateWhiteboardPermission,
  joinAttendance,
  leaveAttendance,
  getAttendance,
};
