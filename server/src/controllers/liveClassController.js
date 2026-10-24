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
            lc.created_at, c.title AS course_title,
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
    can_manage: instructor || user.role === "admin",
  };
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
      await pool.query(
        `UPDATE live_classes
         SET status = 'live', started_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'scheduled'`,
        [liveClass.id]
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
    if (!(await canAccessClass(req.user, liveClass))) {
      return sendError(res, 403, "You are not enrolled in this course.");
    }

    const isInstructor =
      req.user.role === "admin" ||
      (req.user.role === "instructor" &&
        String(req.user.id) === String(liveClass.instructor_id));
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

async function publishRoomEvent(liveClass, userId, event) {
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
    await publishRoomEvent(liveClass, req.user.id, event);
    return res.status(202).json({ success: true });
  } catch (error) {
    if (error.classroomStatus) {
      return sendError(res, error.classroomStatus, error.message);
    }
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
  raiseHand,
};
