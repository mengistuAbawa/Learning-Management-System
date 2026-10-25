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
  const pendingPreviewUrlRef = useRef("");
  const cancelRecordingRef = useRef(false);
  const elapsedBeforeSegmentRef = useRef(0);
  const segmentStartedAtRef = useRef(null);
  const [courseId, setCourseId] = useState("");
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const [availableLessons, setAvailableLessons] = useState([]);
  const [lessonId, setLessonId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [position, setPosition] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [finalizingRecording, setFinalizingRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadAction, setUploadAction] = useState("");
  const [pendingRecording, setPendingRecording] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [videos, setVideos] = useState([]);
  const [videoAnalytics, setVideoAnalytics] = useState({});
  const [playing, setPlaying] = useState({});
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [videoEdit, setVideoEdit] = useState({
    title: "",
    description: "",
    position: 1,
    lesson_id: "",
    status: "draft",
  });
  const [savingVideoId, setSavingVideoId] = useState(null);
  const [deletingVideoId, setDeletingVideoId] = useState(null);
  const selectedCourse = courses.find(
    (course) => String(course.id) === String(courseId)
  );
  const courseLessons = availableLessons.filter(
    (lesson) => String(lesson.course_id) === String(courseId)
  );

  useEffect(() => {
    let active = true;
    async function loadLessons() {
      try {
        const courseModules = await Promise.all(
          courses.map(async (course) => {
            const response = await api.get(`/courses/${course.id}/modules`);
            return (response.data.modules || []).map((module) => ({
              ...module,
              course_id: course.id,
              course_title: course.title,
            }));
          })
        );
        const lessonsByModule = await Promise.all(
          courseModules.flat().map(async (module) => {
            const response = await api.get(`/modules/${module.id}/lessons`);
            return (response.data.lessons || []).map((lesson) => ({
              ...lesson,
              course_id: module.course_id,
              course_title: module.course_title,
              module_title: module.title,
            }));
          })
        );
        if (active) setAvailableLessons(lessonsByModule.flat());
      } catch {
        if (active) setAvailableLessons([]);
      }
    }
    void loadLessons();
    return () => {
      active = false;
    };
  }, [courses]);

  async function loadVideos() {
    const response = await api.get("/course-videos");
    const records = response.data.videos || [];
    setVideos(records);
    await loadVideoAnalytics(records);
  }

  async function loadVideoAnalytics(records) {
    const courseIds = [...new Set(records.map((video) => String(video.course_id)))];
    const results = await Promise.all(
      courseIds.map(async (id) => {
        try {
          const response = await api.get(`/course-videos/courses/${id}/analytics`);
          return response.data.analytics || [];
        } catch {
          return [];
        }
      })
    );
    setVideoAnalytics(
      Object.fromEntries(results.flat().map((item) => [String(item.video_id), item]))
    );
  }

  useEffect(() => {
    let active = true;
    api.get("/course-videos")
      .then(async (response) => {
        if (active) {
          const records = response.data.videos || [];
          setVideos(records);
          await loadVideoAnalytics(records);
        }
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
      if (pendingPreviewUrlRef.current) {
        URL.revokeObjectURL(pendingPreviewUrlRef.current);
      }
    };
  }, []);

  function previewBlob(blob) {
    if (pendingPreviewUrlRef.current) {
      URL.revokeObjectURL(pendingPreviewUrlRef.current);
    }
    pendingPreviewUrlRef.current = URL.createObjectURL(blob);
    setPendingPreviewUrl(pendingPreviewUrlRef.current);
  }

  function clearPendingRecording() {
    setPendingRecording(null);
    if (pendingPreviewUrlRef.current) {
      URL.revokeObjectURL(pendingPreviewUrlRef.current);
      pendingPreviewUrlRef.current = "";
    }
    setPendingPreviewUrl("");
  }

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
          description: description.trim(),
          position,
          lessonId,
          mediaType: recorder.mimeType || mimeType || "video/webm",
        });
        previewBlob(blob);
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
    setUploadProgress(0);
    setUploadAction(status);
    setError("");
    setMessage("");
    const form = new FormData();
    form.append("title", pendingRecording.title);
    form.append("description", pendingRecording.description || "");
    if (pendingRecording.position) form.append("position", pendingRecording.position);
    if (pendingRecording.lessonId) form.append("lesson_id", pendingRecording.lessonId);
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
          onUploadProgress: (event) => {
            if (event.total) {
              setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          },
        }
      );
      clearPendingRecording();
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
      setUploadProgress(0);
    }
  }

  function chooseVideoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (!courseId) {
      setError("Choose the course before selecting a video.");
      return;
    }
    if (!title.trim()) {
      setError("Enter a recording title before selecting a video.");
      return;
    }
    const mediaType = file.type.toLowerCase();
    const supported = ["video/webm", "video/mp4", "video/ogg"];
    if (!supported.includes(mediaType)) {
      setError("Choose a WebM, MP4, or Ogg video file.");
      return;
    }
    if (file.size <= 0 || file.size > 200 * 1024 * 1024) {
      setError("Choose a video file between 1 byte and 200 MB.");
      return;
    }
    setError("");
    setPendingRecording({
      blob: file,
      courseId,
      title: title.trim(),
      description: description.trim(),
      position,
      lessonId,
      mediaType,
    });
    previewBlob(file);
    setMessage("Video ready to preview and upload.");
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
    setVideoEdit({
      title: video.title,
      description: video.description || "",
      position: video.position || 1,
      lesson_id: video.lesson_id || "",
      status: video.status,
    });
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
    <section id="video-lessons" className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
                      setLessonId("");
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
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="video-lesson">
            Attach to a course lesson (optional)
          </label>
          <select
            id="video-lesson"
            value={lessonId}
            onChange={(event) => setLessonId(event.target.value)}
            disabled={!courseId || recording || uploading || pendingRecording}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          >
            <option value="">Course-level video</option>
            {courseLessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.module_title}: {lesson.title}
              </option>
            ))}
          </select>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="video-description">
            Description
          </label>
          <textarea
            id="video-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={4000}
            rows={2}
            disabled={recording || uploading || pendingRecording}
            placeholder="Describe what students will learn in this recording."
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="video-position">
            Course video position (optional)
          </label>
          <input
            id="video-position"
            type="number"
            min="1"
            max="10000"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            disabled={recording || uploading || pendingRecording}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="video-file">
            Or upload a video file (WebM, MP4, or Ogg; up to 200 MB)
          </label>
          <input
            id="video-file"
            type="file"
            accept="video/webm,video/mp4,video/ogg,.ogv"
            onChange={chooseVideoFile}
            disabled={!courseId || !title.trim() || recording || uploading || pendingRecording || cameraEnabled}
            className="mb-3 block w-full rounded-lg border border-slate-300 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cyan-50 file:px-3 file:py-2 file:font-semibold file:text-cyan-800 disabled:bg-slate-100"
          />
          <div className="flex flex-wrap gap-2">
            {!cameraEnabled && !pendingRecording ? (
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
                        clearPendingRecording();
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
            {uploading && (
              <div className="w-full" role="status" aria-live="polite">
                <p className="text-sm text-slate-600">Uploading video… {uploadProgress}%</p>
                <progress
                  className="mt-1 w-full accent-cyan-700"
                  max="100"
                  value={uploadProgress}
                  aria-label="Video upload progress"
                />
              </div>
            )}
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
          {pendingPreviewUrl && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Preview before upload</p>
              <video
                controls
                playsInline
                src={pendingPreviewUrl}
                className="aspect-video w-full rounded-lg bg-slate-900"
              />
            </div>
          )}
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
                          <label className="sr-only" htmlFor={`video-edit-lesson-${video.id}`}>
                            Associate with lesson
                          </label>
                          <select
                            id={`video-edit-lesson-${video.id}`}
                            value={videoEdit.lesson_id}
                            onChange={(event) =>
                              setVideoEdit((current) => ({
                                ...current,
                                lesson_id: event.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          >
                            <option value="">Course-level video</option>
                            {availableLessons
                              .filter((lesson) => String(lesson.course_id) === String(video.course_id))
                              .map((lesson) => (
                                <option key={lesson.id} value={lesson.id}>
                                  {lesson.module_title}: {lesson.title}
                                </option>
                              ))}
                          </select>
                          <label className="sr-only" htmlFor={`video-edit-description-${video.id}`}>
                            Video description
                          </label>
                          <textarea
                            id={`video-edit-description-${video.id}`}
                            value={videoEdit.description}
                            maxLength={4000}
                            onChange={(event) =>
                              setVideoEdit((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <label className="sr-only" htmlFor={`video-edit-position-${video.id}`}>
                            Video position
                          </label>
                          <input
                            id={`video-edit-position-${video.id}`}
                            type="number"
                            min="1"
                            max="10000"
                            value={videoEdit.position}
                            onChange={(event) =>
                              setVideoEdit((current) => ({
                                ...current,
                                position: event.target.value,
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
                        <>
                          <p className="font-medium text-slate-900">{video.title}</p>
                          {video.description && (
                            <p className="mt-1 max-w-md text-xs text-slate-600">{video.description}</p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">Position {video.position}</p>
                        </>
                      )}
                      <p className="text-sm text-slate-600">{video.course_title}</p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          video.status === "draft" ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {video.status === "draft" ? "Draft — not sent" : "Sent to students"}
                      </p>
                      {videoAnalytics[String(video.id)] && (
                        <p className="mt-1 text-xs text-slate-500">
                          {videoAnalytics[String(video.id)].started_students} started ·{" "}
                          {videoAnalytics[String(video.id)].completed_students} completed
                          {videoAnalytics[String(video.id)].average_watch_percentage !== null
                            ? ` · ${videoAnalytics[String(video.id)].average_watch_percentage}% avg. viewed`
                            : ""}
                        </p>
                      )}
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
