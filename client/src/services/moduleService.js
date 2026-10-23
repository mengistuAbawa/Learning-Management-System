import api from "./api";

export async function getModules(courseId) {
  const response = await api.get(`/courses/${courseId}/modules`);
  return response.data;
}

export async function createModule(courseId, data) {
  const response = await api.post(`/courses/${courseId}/modules`, data);
  return response.data;
}

export async function updateModule(id, data) {
  const response = await api.patch(`/modules/${id}`, data);
  return response.data;
}

export async function deleteModule(id) {
  const response = await api.delete(`/modules/${id}`);
  return response.data;
}

export async function reorderModules(courseId, moduleIds) {
  const response = await api.post(`/courses/${courseId}/modules/reorder`, {
    moduleIds,
  });
  return response.data;
}
