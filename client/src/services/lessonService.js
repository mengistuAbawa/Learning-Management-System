import api from "./api";

export async function getLessons(moduleId) {
  const response = await api.get(`/modules/${moduleId}/lessons`);
  return response.data;
}

export async function getLessonById(id) {
  const response = await api.get(`/lessons/${id}`);
  return response.data;
}

export async function createLesson(moduleId, data) {
  const response = await api.post(`/modules/${moduleId}/lessons`, data);
  return response.data;
}

export async function updateLesson(id, data) {
  const response = await api.patch(`/lessons/${id}`, data);
  return response.data;
}

export async function deleteLesson(id) {
  const response = await api.delete(`/lessons/${id}`);
  return response.data;
}

export async function reorderLessons(moduleId, lessonIds) {
  const response = await api.post(`/modules/${moduleId}/lessons/reorder`, {
    lessonIds,
  });
  return response.data;
}