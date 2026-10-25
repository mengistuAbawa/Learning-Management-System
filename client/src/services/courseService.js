import api from "./api";

export async function getCourses(params = {}) {
  const response = await api.get("/courses", { params });
  return response.data;
}

export async function getCourseById(id) {
  const response = await api.get(`/courses/${id}`);
  return response.data;
}

export async function getCategories() {
  const response = await api.get("/courses/categories");
  return response.data;
}

export async function createCategory(name) {
  const response = await api.post("/courses/categories", { name });
  return response.data;
}

export async function createCourse(course) {
  const response = await api.post("/courses", course);
  return response.data;
}

export async function updateCourse(id, course) {
  const response = await api.patch(`/courses/${id}`, course);
  return response.data;
}

export async function deleteCourse(id) {
  const response = await api.delete(`/courses/${id}`);
  return response.data;
}
