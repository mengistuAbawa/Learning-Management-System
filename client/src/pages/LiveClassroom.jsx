import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CameraOff,
  Hand,
  LoaderCircle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Send,
  Video,
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
  const [liveClass, setLiveClass] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
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
      if (room) room.disconnect();
    };
  }, [classId]);

  async function connectToRoom() {
    setJoining(true);
    setError("");
    let room;
    try {
      if (liveClass.can_manage && liveClass.status === "scheduled") {
        const response = await api.post(`/live-classes/${classId}/start`);
        setLiveClass(response.data.live_class);
      }

      const response = await api.post(`/live-classes/${classId}/token`);
      const { token, url } = response.data;
      room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const refreshParticipants = () => updateParticipants(room);
      room.on(RoomEvent.ParticipantConnected, refreshParticipants);
      room.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
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
              [...messages, event.message].slice(-100)
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
          }
        } catch {
          setError("A classroom message could not be read.");
        }
      });

      await room.connect(url, token);
      setConnectionState(room.state);
      updateParticipants(room);
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
  const canJoin =
    liveClass.status === "live" ||
    (liveClass.can_manage && liveClass.status === "scheduled");

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

            <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Class chat</h2>
                <div
                  aria-live="polite"
                  className="mt-4 max-h-72 min-h-36 space-y-3 overflow-y-auto"
                >
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Messages appear here while participants are connected.
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

              <aside className="rounded-2xl border border-white/10 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Participation</h2>
                <button
                  type="button"
                  onClick={toggleHand}
                  disabled={updatingHand}
                  aria-pressed={handRaised}
                  className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold disabled:opacity-50 ${
                    handRaised
                      ? "bg-amber-400 text-slate-950"
                      : "bg-slate-700 text-white hover:bg-slate-600"
                  }`}
                >
                  <Hand className="h-5 w-5" />
                  {handRaised ? "Lower hand" : "Raise hand"}
                </button>
                <h3 className="mt-6 text-sm font-medium text-slate-300">
                  Raised hands ({raisedHands.length})
                </h3>
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
              </aside>
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
              Join with your enrolled account. Your browser will request
              microphone and camera access when you enter. Audio-only
              participation is available if those devices are unavailable.
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
