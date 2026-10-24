import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw, Video } from "lucide-react";
import api from "../services/api";

export default function CourseVideoLibrary() {
  const [videos, setVideos] = useState([]);
  const [playing, setPlaying] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVideos = useCallback(async (showError = true) => {
    setRefreshing(true);
    try {
      const response = await api.get("/course-videos", {
        params: { _refresh: Date.now() },
      });
      setVideos(response.data.videos || []);
      setError("");
    } catch (loadError) {
      if (showError) {
        setError(
          loadError.response?.data?.message || "Course videos could not be loaded."
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadVideos(), 0);
    const refreshTimer = window.setInterval(() => {
      loadVideos(false);
    }, 15000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refreshTimer);
    };
  }, [loadVideos]);

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

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2">
          <Video className="h-5 w-5 text-indigo-700" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">Course videos</h2>
          <p className="text-sm text-slate-600">
            Lessons recorded by instructors for your enrolled courses.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadVideos()}
          disabled={refreshing}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-600">Loading course videos…</p>
      ) : videos.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No video lessons are available for your courses yet.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {videos.map((video) => (
            <li key={video.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{video.title}</h3>
                  <p className="text-sm text-slate-600">{video.course_title}</p>
                  <p className="text-xs text-slate-500">
                    Instructor: {video.instructor_name}
                  </p>
                </div>
                {!playing[video.id] && (
                  <button
                    type="button"
                    onClick={() => playVideo(video.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    <Play className="h-4 w-4" /> Play
                  </button>
                )}
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
                  className="w-full rounded-lg bg-black"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
