
import api from "./api";

export async function getCourseProgress(courseId) {
  const response = await api.get(`/progress/courses/${courseId}`);
  return response.data;
}

export async function getCourseLessonProgress(courseId) {
  const response = await api.get(
    `/progress/courses/${courseId}/lessons`
  );
  return response.data;
}

export async function updateLessonProgress(lessonId, data) {
  const response = await api.patch(`/progress/lessons/${lessonId}`, {
    completed: data.completed,
    last_position_seconds: data.last_position_seconds ?? 0,
  });
  return response.data;
}
