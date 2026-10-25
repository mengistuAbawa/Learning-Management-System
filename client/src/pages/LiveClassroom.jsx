import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Camera,
  CameraOff,
  Eraser,
  Hand,
  LoaderCircle,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Pencil,
  PhoneOff,
  Send,
  UserX,
  Users,
  Video,
  VolumeX,
} from "lucide-react";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

function messageFrom(error) {
  return (
    error.response?.data?.message ||
    error.message ||
    "Unable to connect to the live classroom."
  );
}

function MediaElement({ track, muted = false }) {
  const elementRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !track) return undefined;

    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  if (track.kind === Track.Kind.Audio) {
    return <audio ref={elementRef} autoPlay muted={muted} />;
  }

  return (
    <video
      ref={elementRef}
      autoPlay
      playsInline
      muted={muted}
      className="h-full w-full object-cover"
    />
  );
}

function ParticipantTile({ participant, local }) {
  const videoTracks = Array.from(participant.videoTrackPublications.values())
    .filter((publication) => publication.track && !publication.isMuted)
    .sort((first, second) =>
      first.source === Track.Source.ScreenShare ? -1 : second.source === Track.Source.ScreenShare ? 1 : 0
    );
  const audioTracks = Array.from(participant.audioTrackPublications.values())
    .filter((publication) => publication.track && !publication.isMuted)
    .map((publication) => publication.track);

  return (
    <article className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-slate-900">
      {videoTracks.length ? (
        videoTracks.map((trackPublication) => (
          <MediaElement
            key={trackPublication.trackSid}
            track={trackPublication.track}
            muted={local}
          />
        ))
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
          <Video className="h-8 w-8" />
          <span className="max-w-full truncate px-3 text-sm">
            {participant.name || participant.identity}
          </span>
          <span className="text-xs">Camera off</span>
        </div>
      )}
      {audioTracks.map((track) => (
        <MediaElement
          key={track.sid}
          track={track}
          muted={local}
        />
      ))}
      <div className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-xs text-white">
        {participant.name || participant.identity}
        {local ? " (you)" : ""}
      </div>
    </article>
  );
}

export default function LiveClassroom() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roomRef = useRef(null);
  const attendanceTimerRef = useRef(null);
  const attendanceJoinedRef = useRef(false);
  const drawingRef = useRef(null);
  const [liveClass, setLiveClass] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [classParticipants, setClassParticipants] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [activePanel, setActivePanel] = useState("chat");
  const [polls, setPolls] = useState([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [whiteboardEvents, setWhiteboardEvents] = useState([]);
  const [whiteboardColor, setWhiteboardColor] = useState("#a5b4fc");
  const [whiteboardWidth, setWhiteboardWidth] = useState(4);
  const [studentWhiteboardEditing, setStudentWhiteboardEditing] = useState(true);
  const [moderatingParticipant, setModeratingParticipant] = useState("");
  const [raisedHands, setRaisedHands] = useState([]);
  const [handRaised, setHandRaised] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [updatingHand, setUpdatingHand] = useState(false);
  const [error, setError] = useState("");

  const updateParticipants = useCallback((room) => {
    if (!room) return;
    const local = room.localParticipant;
    setParticipants([
      ...(local ? [{ participant: local, local: true }] : []),
      ...Array.from(room.remoteParticipants.values()).map((participant) => ({
        participant,
        local: false,
      })),
    ]);
  }, []);

  async function refreshClassroomData() {
    try {
      const [chatResponse, pollsResponse, whiteboardResponse, attendanceResponse] =
        await Promise.all([
          api.get(`/live-classes/${classId}/chat`),
          api.get(`/live-classes/${classId}/polls`),
          api.get(`/live-classes/${classId}/whiteboard`),
          liveClass?.can_manage
            ? api.get(`/live-classes/${classId}/attendance`)
            : Promise.resolve({ data: { attendance: [] } }),
        ]);
      setChatMessages(chatResponse.data.messages);
      setPolls(pollsResponse.data.polls);
      setWhiteboardEvents(whiteboardResponse.data.events);
      setStudentWhiteboardEditing(whiteboardResponse.data.student_editing);
      setAttendance(attendanceResponse.data.attendance);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
    if (liveClass?.can_manage) {
      try {
        const response = await api.get(`/live-classes/${classId}/participants`);
        setClassParticipants(response.data.participants);
      } catch (requestError) {
        setError(messageFrom(requestError));
      }
    }
  }

  useEffect(() => {
    let active = true;
    api
      .get(`/live-classes/${classId}`)
      .then((response) => {
        if (active) setLiveClass(response.data.live_class);
      })
      .catch((requestError) => {
        if (active) setError(messageFrom(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      const room = roomRef.current;
      roomRef.current = null;
      if (attendanceTimerRef.current) {
        clearInterval(attendanceTimerRef.current);
        attendanceTimerRef.current = null;
      }
      if (room) {
        room.disconnect();
        if (attendanceJoinedRef.current) {
          attendanceJoinedRef.current = false;
          api.post(`/live-classes/${classId}/attendance/leave`).catch((leaveError) => {
            console.error("Unable to record live-class departure:", leaveError);
          });
        }
      }
    };
  }, [classId]);

  async function connectToRoom() {
    setJoining(true);
    setError("");
    let room;
    try {
      if (liveClass.can_join && liveClass.status === "scheduled") {
        const response = await api.post(`/live-classes/${classId}/start`);
        setLiveClass(response.data.live_class);
      }

      const response = await api.post(`/live-classes/${classId}/token`);
      const { token, url } = response.data;
      room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const refreshParticipants = () => updateParticipants(room);
      room.on(RoomEvent.ParticipantConnected, () => {
        refreshParticipants();
        if (liveClass.can_manage) refreshClassroomData();
      });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        refreshParticipants();
        const userId = participant.identity.startsWith("user-")
          ? participant.identity.slice(5)
          : "";
        if (userId) {
          setRaisedHands((hands) => hands.filter((hand) => hand.user_id !== userId));
          if (liveClass.can_manage) refreshClassroomData();
        }
      });
      room.on(RoomEvent.TrackSubscribed, refreshParticipants);
      room.on(RoomEvent.TrackUnsubscribed, refreshParticipants);
      room.on(RoomEvent.TrackPublished, refreshParticipants);
      room.on(RoomEvent.TrackUnpublished, refreshParticipants);
      room.on(RoomEvent.LocalTrackPublished, refreshParticipants);
      room.on(RoomEvent.LocalTrackUnpublished, refreshParticipants);
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state);
        refreshParticipants();
      });
      room.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"));
      room.on(RoomEvent.Reconnected, () => setConnectionState("connected"));
      room.on(RoomEvent.Disconnected, () => {
        setConnectionState("disconnected");
        refreshParticipants();
        if (attendanceTimerRef.current) {
          clearInterval(attendanceTimerRef.current);
          attendanceTimerRef.current = null;
        }
        if (attendanceJoinedRef.current) {
          attendanceJoinedRef.current = false;
          api.post(`/live-classes/${classId}/attendance/leave`).catch((leaveError) => {
            console.error("Unable to record live-class departure:", leaveError);
            setError(messageFrom(leaveError));
          });
        }
      });
      room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== "learnsphere-classroom") return;
        try {
          const event = JSON.parse(new TextDecoder().decode(payload));
          if (
            event.type === "chat" &&
            event.message &&
            typeof event.message.text === "string" &&
            typeof event.message.participant_name === "string"
          ) {
            setChatMessages((messages) =>
              messages.some((message) => message.id === event.message.id)
                ? messages
                : [...messages, event.message].slice(-100)
            );
          } else if (
            event.type === "hand" &&
            typeof event.user_id === "string" &&
            typeof event.participant_name === "string"
          ) {
            setRaisedHands((hands) => {
              const others = hands.filter((hand) => hand.user_id !== event.user_id);
              return event.raised ? [...others, event] : others;
            });
            if (event.user_id === String(user?.id)) {
              setHandRaised(event.raised === true);
            }
          } else if (event.type === "poll" || event.type === "poll-vote") {
            api
              .get(`/live-classes/${classId}/polls`)
              .then((response) => setPolls(response.data.polls))
              .catch((pollError) => setError(messageFrom(pollError)));
          } else if (
            event.type === "whiteboard" &&
            event.whiteboard_event
          ) {
            setWhiteboardEvents((events) =>
              [...events, event.whiteboard_event].slice(-1000)
            );
          }
        } catch {
          setError("A classroom message could not be read.");
        }
      });

      await room.connect(url, token);
      setConnectionState(room.state);
      updateParticipants(room);
      try {
        await api.post(`/live-classes/${classId}/attendance/join`);
        attendanceJoinedRef.current = true;
        attendanceTimerRef.current = setInterval(() => {
          api.post(`/live-classes/${classId}/attendance/join`).catch((attendanceError) => {
            setError(messageFrom(attendanceError));
          });
        }, 30000);
      } catch (attendanceError) {
        setError(`You joined the class, but attendance could not be recorded: ${messageFrom(attendanceError)}`);
      }
      await refreshClassroomData();
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicrophoneOn(true);
      } catch {
        setMicrophoneOn(false);
        setError(
          "You joined the class, but microphone access was unavailable. Check browser permissions or continue in listen-only mode."
        );
      }
      try {
        await room.localParticipant.setCameraEnabled(true);
        setCameraOn(true);
      } catch {
        setCameraOn(false);
        setError(
          "You joined the class without camera video. Check browser permissions or continue with audio."
        );
      }
      updateParticipants(room);
    } catch (requestError) {
      if (room) {
        room.disconnect();
        if (roomRef.current === room) roomRef.current = null;
      }
      setError(messageFrom(requestError));
      setConnectionState("disconnected");
    } finally {
      setJoining(false);
    }
  }

  async function toggleMicrophone() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!microphoneOn);
      setMicrophoneOn((enabled) => !enabled);
    } catch (toggleError) {
      setError(messageFrom(toggleError));
    }
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(!cameraOn);
      setCameraOn((enabled) => !enabled);
    } catch (toggleError) {
      setError(messageFrom(toggleError));
    }
  }

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room || !liveClass?.can_manage) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!screenSharing);
      setScreenSharing((enabled) => !enabled);
    } catch (shareError) {
      setError(messageFrom(shareError));
    }
  }

  async function leaveClass() {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect();
    setParticipants([]);
    setConnectionState("disconnected");
    navigate("/live-classes", { replace: true });
  }

  async function endClass() {
    try {
      await api.post(`/live-classes/${classId}/end`);
      await leaveClass();
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  async function sendChatMessage(event) {
    event.preventDefault();
    const message = chatText.trim();
    if (!message || sendingChat) return;
    setSendingChat(true);
    setError("");
    try {
      await api.post(`/live-classes/${classId}/chat`, { message });
      setChatText("");
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSendingChat(false);
    }
  }

  async function toggleHand() {
    if (updatingHand) return;
    setUpdatingHand(true);
    setError("");
    try {
      const response = await api.post(`/live-classes/${classId}/hand`, {
        raised: !handRaised,
      });
      setHandRaised(response.data.raised);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setUpdatingHand(false);
    }
  }

  async function createPoll(event) {
    event.preventDefault();
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    try {
      const response = await api.post(`/live-classes/${classId}/polls`, {
        question,
        options,
      });
      setPolls((current) => [response.data.poll, ...current]);
      setPollQuestion("");
      setPollOptions(["", ""]);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  async function voteInPoll(pollId, optionIndex) {
    try {
      await api.post(`/live-classes/${classId}/polls/${pollId}/vote`, {
        option_index: optionIndex,
      });
      const response = await api.get(`/live-classes/${classId}/polls`);
      setPolls(response.data.polls);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  async function setPollStatus(poll, status) {
    try {
      await api.patch(`/live-classes/${classId}/polls/${poll.id}`, { status });
      const response = await api.get(`/live-classes/${classId}/polls`);
      setPolls(response.data.polls);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  async function moderateParticipant(participantId, action) {
    setModeratingParticipant(`${participantId}:${action}`);
    try {
      await api.post(
        `/live-classes/${classId}/participants/${participantId}/${action}`
      );
      const response = await api.get(`/live-classes/${classId}/participants`);
      setClassParticipants(response.data.participants);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setModeratingParticipant("");
    }
  }

  function getWhiteboardPoint(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1000, ((event.clientX - bounds.left) / bounds.width) * 1000)),
      y: Math.max(0, Math.min(600, ((event.clientY - bounds.top) / bounds.height) * 600)),
    };
  }

  function beginWhiteboardStroke(event) {
    if (!liveClass.can_manage && !studentWhiteboardEditing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = {
      color: whiteboardColor,
      width: whiteboardWidth,
      points: [getWhiteboardPoint(event)],
    };
  }

  function continueWhiteboardStroke(event) {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(getWhiteboardPoint(event));
  }

  async function finishWhiteboardStroke() {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    try {
      const response = await api.post(`/live-classes/${classId}/whiteboard`, {
        event_type: "stroke",
        payload: stroke,
      });
      setWhiteboardEvents((events) =>
        events.some((item) => item.id === response.data.event.id)
          ? events
          : [...events, response.data.event].slice(-1000)
      );
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  async function clearWhiteboard() {
    try {
      const response = await api.post(`/live-classes/${classId}/whiteboard`, {
        event_type: "clear",
      });
      setWhiteboardEvents([response.data.event]);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  async function toggleStudentWhiteboardEditing() {
    try {
      const response = await api.patch(
        `/live-classes/${classId}/whiteboard/permissions`,
        { student_editing: !studentWhiteboardEditing }
      );
      setStudentWhiteboardEditing(response.data.student_editing);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <LoaderCircle className="h-8 w-8 animate-spin text-indigo-400" />
      </main>
    );
  }

  if (!liveClass) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <p role="alert" className="text-rose-300">
          {error || "Live class not found."}
        </p>
        <Link to="/live-classes" className="mt-4 inline-block text-indigo-300">
          Back to live classes
        </Link>
      </main>
    );
  }

  const isConnected = connectionState === ConnectionState.Connected;
  const canJoin = liveClass.can_join;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              to="/live-classes"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Live classes
            </Link>
            <h1 className="mt-3 text-2xl font-bold">{liveClass.title}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {liveClass.course_title} · {liveClass.instructor_name}
            </p>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm capitalize text-slate-200">
            {isConnected ? connectionState : liveClass.status}
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-5 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {isConnected ? (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {participants.map(({ participant, local }) => (
                <ParticipantTile
                  key={participant.identity}
                  participant={participant}
                  local={local}
                />
              ))}
            </section>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-900 p-4">
              <button
                type="button"
                onClick={toggleMicrophone}
                aria-label={microphoneOn ? "Mute microphone" : "Enable microphone"}
                className="rounded-full bg-slate-700 p-3 hover:bg-slate-600"
              >
                {microphoneOn ? <Mic /> : <MicOff />}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
                className="rounded-full bg-slate-700 p-3 hover:bg-slate-600"
              >
                {cameraOn ? <Camera /> : <CameraOff />}
              </button>
              {liveClass.can_manage && (
                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-3 font-semibold ${
                    screenSharing
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-700 text-slate-100 hover:bg-slate-600"
                  }`}
                >
                  <MonitorUp className="h-5 w-5" />
                  {screenSharing ? "Stop sharing" : "Share screen"}
                </button>
              )}
              <button
                type="button"
                onClick={leaveClass}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-3 font-semibold hover:bg-rose-500"
              >
                <PhoneOff className="h-5 w-5" />
                Leave class
              </button>
              {liveClass.can_manage && (
                <button
                  type="button"
                  onClick={endClass}
                  className="rounded-full border border-rose-400/40 px-4 py-3 font-semibold text-rose-200 hover:bg-rose-500/10"
                >
                  End for everyone
                </button>
              )}
            </div>

            <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
              <nav
                aria-label="Classroom tools"
                className="flex gap-1 overflow-x-auto border-b border-white/10 p-2"
              >
                {[
                  { id: "people", label: "People", icon: Users },
                  { id: "chat", label: "Chat", icon: MessageSquare },
                  { id: "polls", label: "Polls", icon: BarChart3 },
                  { id: "whiteboard", label: "Whiteboard", icon: Pencil },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activePanel === id}
                    onClick={() => setActivePanel(id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
                      activePanel === id
                        ? "bg-indigo-600 text-white"
                        : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {id === "people" && ` (${participants.length})`}
                  </button>
                ))}
              </nav>

              <div className="p-4 sm:p-6">
                {activePanel === "chat" && (
                  <div>
                    <h2 className="text-lg font-semibold">Class chat</h2>
                    <div
                      aria-live="polite"
                      className="mt-4 max-h-80 min-h-36 space-y-3 overflow-y-auto"
                    >
                      {chatMessages.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          Messages remain available to enrolled participants after they leave.
                        </p>
                      ) : (
                        chatMessages.map((message) => (
                          <article key={message.id} className="rounded-lg bg-slate-800 p-3">
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                              <span className="font-medium text-slate-200">
                                {message.participant_name}
                              </span>
                              <time dateTime={message.sent_at}>
                                {new Date(message.sent_at).toLocaleTimeString()}
                              </time>
                            </div>
                            <p className="mt-1 break-words text-sm">{message.text}</p>
                          </article>
                        ))
                      )}
                    </div>
                    <form onSubmit={sendChatMessage} className="mt-4 flex gap-2">
                      <label className="sr-only" htmlFor="class-chat-message">
                        Chat message
                      </label>
                      <input
                        id="class-chat-message"
                        value={chatText}
                        onChange={(event) => setChatText(event.target.value)}
                        maxLength={500}
                        placeholder="Write a message..."
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                      <button
                        type="submit"
                        disabled={!chatText.trim() || sendingChat}
                        aria-label="Send chat message"
                        className="rounded-lg bg-indigo-600 p-2.5 text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        <Send className="h-5 w-5" />
                      </button>
                    </form>
                  </div>
                )}

                {activePanel === "people" && (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Participants ({participants.length})
                      </h2>
                      <ul className="mt-4 space-y-2">
                        {participants.map(({ participant, local }) => {
                          const row = classParticipants.find(
                            (item) => String(item.id) === participant.identity.replace(/^user-/, "")
                          );
                          return (
                            <li
                              key={participant.identity}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-800 p-3"
                            >
                              <div>
                                <p className="font-medium">
                                  {participant.name || row?.full_name || participant.identity}
                                  {local ? " (you)" : ""}
                                </p>
                                <p className="text-xs capitalize text-slate-400">
                                  {row?.role || (local ? user?.role : "participant")}
                                  {row?.connected ? " · present" : ""}
                                </p>
                              </div>
                              {liveClass.can_manage && !local && row?.role === "student" && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => moderateParticipant(row.id, "mute")}
                                    disabled={Boolean(moderatingParticipant)}
                                    aria-label={`Mute ${row.full_name}`}
                                    className="rounded-md bg-slate-700 p-2 text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                                  >
                                    <VolumeX className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moderateParticipant(row.id, "remove")}
                                    disabled={Boolean(moderatingParticipant)}
                                    aria-label={`Remove ${row.full_name}`}
                                    className="rounded-md bg-rose-900/70 p-2 text-rose-200 hover:bg-rose-800 disabled:opacity-50"
                                  >
                                    {moderatingParticipant === `${row.id}:remove` ? (
                                      <LoaderCircle className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <UserX className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {participants.length === 0 && (
                        <p className="mt-4 text-sm text-slate-400">No connected participants.</p>
                      )}
                    </div>
                    <aside className="rounded-xl bg-slate-800/70 p-4">
                      <h3 className="font-semibold">Participation</h3>
                      <button
                        type="button"
                        onClick={toggleHand}
                        disabled={updatingHand}
                        aria-pressed={handRaised}
                        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold disabled:opacity-50 ${
                          handRaised
                            ? "bg-amber-400 text-slate-950"
                            : "bg-slate-700 text-white hover:bg-slate-600"
                        }`}
                      >
                        <Hand className="h-5 w-5" />
                        {handRaised ? "Lower hand" : "Raise hand"}
                      </button>
                      <h4 className="mt-5 text-sm font-medium text-slate-300">
                        Raised hands ({raisedHands.length})
                      </h4>
                      <ul className="mt-2 space-y-2 text-sm text-slate-200">
                        {raisedHands.map((hand) => (
                          <li key={hand.user_id} className="rounded-lg bg-slate-800 px-3 py-2">
                            {hand.participant_name}
                          </li>
                        ))}
                        {raisedHands.length === 0 && (
                          <li className="text-slate-400">No raised hands.</li>
                        )}
                      </ul>
                      {liveClass.can_manage && (
                        <>
                          <h4 className="mt-5 font-medium">Attendance</h4>
                          <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto text-sm">
                            {attendance.map((entry) => (
                              <li key={entry.user_id} className="rounded-lg bg-slate-800 p-2">
                                <span className="block">{entry.full_name}</span>
                                <span className="text-xs text-slate-400">
                                  {Math.floor(Number(entry.total_duration_seconds) / 60)} min ·{" "}
                                  {entry.join_count} join{Number(entry.join_count) === 1 ? "" : "s"}
                                  {entry.connected ? " · present" : ""}
                                </span>
                              </li>
                            ))}
                            {attendance.length === 0 && (
                              <li className="text-slate-400">Attendance will appear after participants join.</li>
                            )}
                          </ul>
                        </>
                      )}
                    </aside>
                  </div>
                )}

                {activePanel === "polls" && (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <div>
                      <h2 className="text-lg font-semibold">Class polls</h2>
                      <div className="mt-4 space-y-4">
                        {polls.map((poll) => (
                          <article key={poll.id} className="rounded-xl bg-slate-800 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="font-semibold">{poll.question}</h3>
                              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs capitalize">
                                {poll.status}
                              </span>
                            </div>
                            <div className="mt-3 space-y-2">
                              {poll.options.map((option, index) => {
                                const counts = poll.vote_counts;
                                const selected = Number(poll.my_option_index) === index;
                                return (
                                  <button
                                    key={`${poll.id}-${option}`}
                                    type="button"
                                    onClick={() => voteInPoll(poll.id, index)}
                                    disabled={poll.status !== "open" || poll.my_option_index != null}
                                    aria-pressed={selected}
                                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-default ${
                                      selected
                                        ? "border-indigo-400 bg-indigo-500/20"
                                        : "border-white/10 bg-slate-900 hover:bg-slate-700 disabled:hover:bg-slate-900"
                                    }`}
                                  >
                                    <span>{option}</span>
                                    {Array.isArray(counts) && (
                                      <span className="text-xs text-slate-300">
                                        {Number(counts[index] || 0)} vote
                                        {Number(counts[index] || 0) === 1 ? "" : "s"}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {liveClass.can_manage && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPollStatus(poll, poll.status === "open" ? "closed" : "open")
                                }
                                className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
                              >
                                {poll.status === "open" ? "Close poll and reveal results" : "Reopen poll"}
                              </button>
                            )}
                          </article>
                        ))}
                        {polls.length === 0 && (
                          <p className="text-sm text-slate-400">No polls have been created yet.</p>
                        )}
                      </div>
                    </div>
                    {liveClass.can_manage && (
                      <form onSubmit={createPoll} className="space-y-3 rounded-xl bg-slate-800/70 p-4">
                        <h3 className="font-semibold">Create a poll</h3>
                        <label className="block text-sm text-slate-300" htmlFor="poll-question">
                          Question
                        </label>
                        <input
                          id="poll-question"
                          value={pollQuestion}
                          onChange={(event) => setPollQuestion(event.target.value)}
                          required
                          minLength={3}
                          maxLength={500}
                          className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
                        />
                        {pollOptions.map((option, index) => (
                          <input
                            key={index}
                            aria-label={`Poll option ${index + 1}`}
                            value={option}
                            onChange={(event) =>
                              setPollOptions((current) =>
                                current.map((value, optionIndex) =>
                                  optionIndex === index ? event.target.value : value
                                )
                              )
                            }
                            required
                            maxLength={200}
                            placeholder={`Option ${index + 1}`}
                            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
                          />
                        ))}
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold hover:bg-indigo-500"
                        >
                          Launch poll
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {activePanel === "whiteboard" && (
                  <div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">Shared whiteboard</h2>
                        <p className="text-sm text-slate-400">
                          {studentWhiteboardEditing
                            ? "Participants can draw together."
                            : "Only the instructor can draw."}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor="whiteboard-color">Pen color</label>
                        <input
                          id="whiteboard-color"
                          type="color"
                          value={whiteboardColor}
                          onChange={(event) => setWhiteboardColor(event.target.value)}
                          aria-label="Pen color"
                          className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent"
                        />
                        <label className="sr-only" htmlFor="whiteboard-width">Pen size</label>
                        <input
                          id="whiteboard-width"
                          type="range"
                          min="1"
                          max="20"
                          value={whiteboardWidth}
                          onChange={(event) => setWhiteboardWidth(Number(event.target.value))}
                          aria-label="Pen size"
                        />
                        {liveClass.can_manage && (
                          <>
                            <button
                              type="button"
                              onClick={toggleStudentWhiteboardEditing}
                              className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10"
                            >
                              {studentWhiteboardEditing ? "Lock student drawing" : "Allow student drawing"}
                            </button>
                            <button
                              type="button"
                              onClick={clearWhiteboard}
                              aria-label="Clear whiteboard"
                              className="rounded-lg border border-rose-400/30 p-2 text-rose-200 hover:bg-rose-500/10"
                            >
                              <Eraser className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 1000 600"
                      role="img"
                      aria-label="Collaborative class whiteboard"
                      onPointerDown={beginWhiteboardStroke}
                      onPointerMove={continueWhiteboardStroke}
                      onPointerUp={finishWhiteboardStroke}
                      onPointerCancel={finishWhiteboardStroke}
                      className="h-[min(65vh,38rem)] w-full rounded-xl border border-white/10 bg-slate-950"
                      style={{ touchAction: "none", cursor: studentWhiteboardEditing || liveClass.can_manage ? "crosshair" : "default" }}
                    >
                      {whiteboardEvents
                        .filter((event) => event.event_type === "stroke")
                        .map((event) => (
                          <polyline
                            key={event.id}
                            points={event.payload.points.map((point) => `${point.x},${point.y}`).join(" ")}
                            fill="none"
                            stroke={event.payload.color}
                            strokeWidth={event.payload.width}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                    </svg>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">
            <Video className="mx-auto h-10 w-10 text-indigo-300" />
            <h2 className="mt-4 text-xl font-semibold">
              {liveClass.status === "scheduled"
                ? "This class has not started yet"
                : liveClass.status === "ended"
                  ? "This class has ended"
                  : "This class is unavailable"}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
              {user?.role === "admin"
                ? "Administrators can review this session but cannot enter the classroom media room."
                : "Join with your enrolled account. Your browser will request microphone and camera access when you enter. Audio-only participation is available if those devices are unavailable."}
            </p>
            {canJoin && (
              <button
                type="button"
                onClick={connectToRoom}
                disabled={joining}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-60"
              >
                {joining ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Video className="h-5 w-5" />
                )}
                {joining ? "Connecting..." : "Join classroom"}
              </button>
            )}
          </section>
        )}

        <p className="mt-4 text-center text-xs text-slate-500">
          {participants.length} participant{participants.length === 1 ? "" : "s"}
          {user?.role === "student" && " · Students can publish camera and microphone only"}
        </p>
      </div>
    </main>
  );
}
