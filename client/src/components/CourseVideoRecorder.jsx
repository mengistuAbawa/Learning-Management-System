import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  CircleStop,
  Pencil,
  Pause,
  Play,
  Save,
  Trash2,
  Video,
  X,
} from "lucide-react";
import api from "../services/api";

const MIME_PREFERENCES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
  "video/ogg",
];

function formatRecordingTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function CourseVideoRecorder({ courses }) {
  const previewRef = useRef(null);
  const coursePickerRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const cancelRecordingRef = useRef(false);
  const elapsedBeforeSegmentRef = useRef(0);
  const segmentStartedAtRef = useRef(null);
  const [courseId, setCourseId] = useState("");
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [finalizingRecording, setFinalizingRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadAction, setUploadAction] = useState("");
  const [pendingRecording, setPendingRecording] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [videos, setVideos] = useState([]);
  const [playing, setPlaying] = useState({});
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [videoEdit, setVideoEdit] = useState({ title: "", status: "draft" });
  const [savingVideoId, setSavingVideoId] = useState(null);
  const [deletingVideoId, setDeletingVideoId] = useState(null);
  const selectedCourse = courses.find(
    (course) => String(course.id) === String(courseId)
  );

  async function loadVideos() {
    const response = await api.get("/course-videos");
    setVideos(response.data.videos || []);
  }

  useEffect(() => {
    let active = true;
    api.get("/course-videos")
      .then((response) => {
        if (active) setVideos(response.data.videos || []);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError.response?.data?.message ||
              "Could not load your course recordings."
          );
        }
      });
    return () => {
      active = false;
      cancelRecordingRef.current = true;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording || finalizingRecording) return undefined;
    const timer = window.setInterval(() => {
      const segmentElapsed =
        segmentStartedAtRef.current === null
          ? 0
          : performance.now() - segmentStartedAtRef.current;
      setRecordingElapsedMs(elapsedBeforeSegmentRef.current + segmentElapsed);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, finalizingRecording]);

  useEffect(() => {
    if (!coursePickerOpen) return undefined;
    function closePicker(event) {
      if (!coursePickerRef.current?.contains(event.target)) {
        setCoursePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", closePicker);
    return () => document.removeEventListener("mousedown", closePicker);
  }, [coursePickerOpen]);

  async function startCamera() {
    setError("");
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera recording requires a secure connection (HTTPS or localhost).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      streamRef.current = stream;
      if (previewRef.current) previewRef.current.srcObject = stream;
      setCameraEnabled(true);
    } catch (cameraError) {
      setError(
        cameraError.name === "NotAllowedError"
          ? "Allow camera and microphone access in your browser to record."
          : "The camera could not be started. Check that it is connected and available."
      );
    }
  }

  function stopCamera() {
    if (recording) recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraEnabled(false);
    if (previewRef.current) previewRef.current.srcObject = null;
    setRecording(false);
    setRecordingPaused(false);
  }

  function startRecording() {
    setError("");
    setMessage("");
    if (!courseId || !title.trim()) {
      setError("Choose a course and enter a title before recording.");
      return;
    }
    if (!streamRef.current || !window.MediaRecorder) {
      setError("Camera preview must be enabled, and this browser must support recording.");
      return;
    }
    const mimeType = MIME_PREFERENCES.find((type) =>
      window.MediaRecorder.isTypeSupported(type)
    );
    try {
      cancelRecordingRef.current = false;
      elapsedBeforeSegmentRef.current = 0;
      segmentStartedAtRef.current = performance.now();
      setRecordingElapsedMs(0);
      const recorder = new window.MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        if (cancelRecordingRef.current) return;
        if (segmentStartedAtRef.current !== null) {
          elapsedBeforeSegmentRef.current +=
            performance.now() - segmentStartedAtRef.current;
          segmentStartedAtRef.current = null;
        }
        setRecordingElapsedMs(elapsedBeforeSegmentRef.current);
        setRecording(false);
        setRecordingPaused(false);
        setFinalizingRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "video/webm",
        });
        if (blob.size === 0) {
          setError("The recording was empty. Please record again.");
          return;
        }
        setPendingRecording({
          blob,
          courseId,
          title: title.trim(),
          mediaType: recorder.mimeType || mimeType || "video/webm",
        });
        setMessage("Recording finished. Save it as a draft or send it to students.");
      };
      recorder.onerror = () => {
        setRecording(false);
        setRecordingPaused(false);
        setFinalizingRecording(false);
        segmentStartedAtRef.current = null;
        setError("The browser encountered an error while recording.");
      };
      recorder.onpause = () => {
        if (segmentStartedAtRef.current !== null) {
          elapsedBeforeSegmentRef.current +=
            performance.now() - segmentStartedAtRef.current;
          segmentStartedAtRef.current = null;
          setRecordingElapsedMs(elapsedBeforeSegmentRef.current);
        }
        setRecordingPaused(true);
      };
      recorder.onresume = () => {
        segmentStartedAtRef.current = performance.now();
        setRecordingPaused(false);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setRecordingPaused(false);
      setFinalizingRecording(false);
    } catch {
      setError("This browser could not start recording in a supported video format.");
    }
  }

  function toggleRecordingPause() {
    const recorder = recorderRef.current;
    if (!recorder || !recording) return;
    if (recorder.state === "recording") {
      recorder.pause();
    } else if (recorder.state === "paused") {
      recorder.resume();
    }
  }

  function stopAndUploadRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setError("The recorder is not active. Start a recording before finishing.");
      return;
    }
    if (segmentStartedAtRef.current !== null) {
      elapsedBeforeSegmentRef.current +=
        performance.now() - segmentStartedAtRef.current;
      segmentStartedAtRef.current = null;
      setRecordingElapsedMs(elapsedBeforeSegmentRef.current);
    }
    setFinalizingRecording(true);
    recorder.stop();
  }

  async function saveRecording(status) {
    if (!pendingRecording) return;
    setUploading(true);
    setUploadAction(status);
    setError("");
    setMessage("");
    const form = new FormData();
    form.append("title", pendingRecording.title);
    form.append("status", status);
    const mediaType = pendingRecording.mediaType
      .split(";")[0]
      .toLowerCase()
      .replace("video/x-matroska", "video/webm");
    const extension = mediaType.split("/")[1];
    const normalizedBlob = new Blob([pendingRecording.blob], { type: mediaType });
    form.append("video", normalizedBlob, `course-recording.${extension}`);
    try {
      await api.post(
        `/course-videos/courses/${pendingRecording.courseId}`,
        form,
        {
          timeout: 10 * 60 * 1000,
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      setPendingRecording(null);
      elapsedBeforeSegmentRef.current = 0;
      setRecordingElapsedMs(0);
      setMessage(
        status === "draft"
          ? "Recording saved as a draft. Students cannot access it until you send it."
          : "Recording sent. Enrolled students can now watch it."
      );
      try {
        await loadVideos();
      } catch {
        setError("The recording was saved, but the recordings list could not refresh.");
      }
    } catch (uploadError) {
      setError(
        uploadError.response?.data?.message || "The recording could not be saved."
      );
    } finally {
      setUploading(false);
      setUploadAction("");
    }
  }

  async function publishDraft(videoId) {
    setError("");
    try {
      await api.patch(`/course-videos/${videoId}/publish`);
    } catch (publishError) {
      setError(
        publishError.response?.data?.message ||
          "The draft could not be sent to students."
      );
      return;
    }
    setMessage("Recording sent. Enrolled students can now watch it.");
    try {
      await loadVideos();
    } catch {
      setError("The recording was sent, but the recordings list could not refresh.");
    }
  }

  function beginEditVideo(video) {
    setError("");
    setEditingVideoId(String(video.id));
    setVideoEdit({ title: video.title, status: video.status });
  }

  async function saveVideoChanges(videoId) {
    setSavingVideoId(String(videoId));
    setError("");
    try {
      await api.put(`/course-videos/${videoId}`, videoEdit);
      setEditingVideoId(null);
      setMessage("Video details updated.");
    } catch (saveError) {
      setError(saveError.response?.data?.message || "The video could not be updated.");
      return;
    } finally {
      setSavingVideoId(null);
    }
    try {
      await loadVideos();
    } catch {
      setError("Video details were updated, but the recordings list could not refresh.");
    }
  }

  async function deleteVideo(video) {
    if (!window.confirm(`Delete "${video.title}"? This cannot be undone.`)) return;

    setDeletingVideoId(String(video.id));
    setError("");
    try {
      await api.delete(`/course-videos/${video.id}`);
      setVideos((current) =>
        current.filter((item) => String(item.id) !== String(video.id))
      );
      setPlaying((current) => {
        const next = { ...current };
        delete next[video.id];
        return next;
      });
      setMessage("Video deleted.");
      if (String(editingVideoId) === String(video.id)) setEditingVideoId(null);
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || "The video could not be deleted.");
    } finally {
      setDeletingVideoId(null);
    }
  }

  async function playVideo(videoId) {
    setError("");
    try {
      const response = await api.post(`/course-videos/${videoId}/playback`);
      const baseUrl = new URL(api.defaults.baseURL, window.location.origin).toString().replace(/\/?$/, "/");
      setPlaying((current) => ({
        ...current,
        [videoId]: new URL(response.data.path, baseUrl).toString(),
      }));
    } catch (playError) {
      setError(
        playError.response?.data?.message || "This video could not be opened."
      );
    }
  }

  function handleCoursePickerKeyDown(event) {
    if (event.key === "Escape") setCoursePickerOpen(false);
  }

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-lg bg-cyan-100 p-2">
          <Video className="h-5 w-5 text-cyan-700" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">Course video recordings</h2>
          <p className="text-sm text-slate-600">
            Record a lesson for students enrolled in one of your courses. Maximum upload: 200 MB.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-3 text-sm text-emerald-700">{message}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" id="video-course-label">
            Course
          </label>
          <div
            ref={coursePickerRef}
            className="relative mb-3"
            onKeyDown={handleCoursePickerKeyDown}
          >
            <button
              type="button"
              aria-labelledby="video-course-label"
              aria-haspopup="listbox"
              aria-expanded={coursePickerOpen}
              disabled={recording || uploading || pendingRecording || courses.length === 0}
              onClick={() => setCoursePickerOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm hover:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            >
              <span className={selectedCourse ? "" : "text-slate-500"}>
                {selectedCourse?.title ||
                  (courses.length ? "Select a course" : "No courses available")}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${coursePickerOpen ? "rotate-180" : ""}`}
              />
            </button>
            {coursePickerOpen && courses.length > 0 && (
              <div
                role="listbox"
                aria-labelledby="video-course-label"
                className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
              >
                {courses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    role="option"
                    aria-selected={String(course.id) === String(courseId)}
                    onClick={() => {
                      setCourseId(String(course.id));
                      setCoursePickerOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-cyan-50 ${
                      String(course.id) === String(courseId)
                        ? "bg-cyan-50 font-semibold text-cyan-800"
                        : "text-slate-800"
                    }`}
                  >
                    {course.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="video-title">
            Recording title
          </label>
          <input
            id="video-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            disabled={recording || uploading || pendingRecording}
            placeholder="e.g. Week 3: Introduction"
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <div className="flex flex-wrap gap-2">
            {!cameraEnabled ? (
              <button
                type="button"
                onClick={startCamera}
                disabled={!courses.length || uploading || pendingRecording}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Camera className="h-4 w-4" /> Enable camera
              </button>
            ) : (
              <>
                {!pendingRecording ? (
                  <>
                  <button
                    type="button"
                    onClick={recording ? stopAndUploadRecording : startRecording}
                    disabled={uploading || finalizingRecording}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {recording && !finalizingRecording ? (
                      <CircleStop className="h-4 w-4" />
                    ) : (
                      <Video className="h-4 w-4" />
                    )}
                    {finalizingRecording
                      ? "Finishing recording…"
                      : recording
                        ? "Finish recording"
                        : "Start recording"}
                  </button>
                  {recording && !finalizingRecording && (
                    <button
                      type="button"
                      onClick={toggleRecordingPause}
                      disabled={uploading}
                      aria-label={recordingPaused ? "Resume recording" : "Pause recording"}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {recordingPaused ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Pause className="h-4 w-4" />
                      )}
                      {recordingPaused ? "Resume recording" : "Pause recording"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={stopCamera}
                    disabled={recording || uploading}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Turn camera off
                  </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => saveRecording("draft")}
                      disabled={uploading}
                      className="rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50"
                    >
                      {uploading && uploadAction === "draft" ? "Saving draft…" : "Save draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveRecording("published")}
                      disabled={uploading}
                      className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                    >
                      {uploading && uploadAction === "published" ? "Sending…" : "Send to students"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingRecording(null);
                        elapsedBeforeSegmentRef.current = 0;
                        setRecordingElapsedMs(0);
                      }}
                      disabled={uploading}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      Discard
                    </button>
                  </>
                )}
              </>
            )}
            {uploading && <span className="self-center text-sm text-slate-600">Uploading recording…</span>}
            {recording && (
              <span role="status" className="self-center text-sm font-medium text-red-700">
                {finalizingRecording
                  ? "Finishing recording…"
                  : recordingPaused
                    ? "Paused"
                    : "Recording"}
              </span>
            )}
            {pendingRecording && (
              <span role="status" className="self-center text-sm text-slate-600">
                Recording ready to save or send
              </span>
            )}
          </div>
          {(recording || pendingRecording) && (
            <p
              role="timer"
              aria-label="Recording duration"
              className="mt-3 font-mono text-lg font-semibold tabular-nums text-slate-800"
            >
              {formatRecordingTime(recordingElapsedMs)}
            </p>
          )}
          <video
            ref={previewRef}
            autoPlay
            muted
            playsInline
            className="mt-4 aspect-video w-full rounded-lg bg-slate-900"
          />
        </div>

        <div>
          <h3 className="mb-3 font-semibold text-slate-900">Your uploaded recordings</h3>
          {videos.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              Your recordings will appear here after upload.
            </p>
          ) : (
            <ul className="space-y-3">
              {videos.map((video) => (
                <li key={video.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      {String(editingVideoId) === String(video.id) ? (
                        <div className="grid gap-2">
                          <label className="sr-only" htmlFor={`video-edit-title-${video.id}`}>
                            Video title
                          </label>
                          <input
                            id={`video-edit-title-${video.id}`}
                            value={videoEdit.title}
                            maxLength={200}
                            onChange={(event) =>
                              setVideoEdit((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <label className="sr-only" htmlFor={`video-edit-status-${video.id}`}>
                            Video visibility
                          </label>
                          <select
                            id={`video-edit-status-${video.id}`}
                            value={videoEdit.status}
                            onChange={(event) =>
                              setVideoEdit((current) => ({
                                ...current,
                                status: event.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          >
                            <option value="draft">Draft — instructor only</option>
                            <option value="published">Published to enrolled students</option>
                          </select>
                        </div>
                      ) : (
                        <p className="font-medium text-slate-900">{video.title}</p>
                      )}
                      <p className="text-sm text-slate-600">{video.course_title}</p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          video.status === "draft" ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {video.status === "draft" ? "Draft — not sent" : "Sent to students"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {String(editingVideoId) === String(video.id) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveVideoChanges(video.id)}
                            disabled={
                              savingVideoId !== null ||
                              !videoEdit.title.trim() ||
                              deletingVideoId !== null
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            <Save className="h-4 w-4" />
                            {savingVideoId === String(video.id) ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingVideoId(null)}
                            disabled={savingVideoId !== null}
                            aria-label="Cancel editing video"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          >
                            <X className="h-4 w-4" /> Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => beginEditVideo(video)}
                          disabled={savingVideoId !== null || deletingVideoId !== null}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                      )}
                      {video.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => publishDraft(video.id)}
                          className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800"
                        >
                          Send
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteVideo(video)}
                        disabled={deletingVideoId !== null || savingVideoId !== null}
                        aria-label={`Delete ${video.title}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingVideoId === String(video.id) ? "Deleting…" : "Delete"}
                      </button>
                      {!playing[video.id] && (
                        <button
                          type="button"
                          onClick={() => playVideo(video.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        >
                          <Play className="h-4 w-4" /> Play
                        </button>
                      )}
                    </div>
                  </div>
                  {playing[video.id] && (
                    <video
                      controls
                      playsInline
                      crossOrigin="anonymous"
                      src={playing[video.id]}
                      onError={() =>
                        setError(
                          "The video could not load. Check that the recording is available and try again."
                        )
                      }
                      className="mt-3 w-full rounded-lg bg-black"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
