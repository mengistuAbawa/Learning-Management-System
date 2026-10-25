
import api from "./api";

export async function enrollInCourse(courseId) {
  const response = await api.post(`/enrollments/courses/${courseId}`);
  return response.data;
}

export async function enrollStudentInCourse(courseId, studentEmail) {
  const response = await api.post(
    `/enrollments/courses/${courseId}/students`,
    { student_email: studentEmail }
  );
  return response.data;
}

export async function getMyEnrollments() {
  const response = await api.get("/enrollments/my");
  return response.data;
}

export async function getCourseEnrollments(courseId) {
  const response = await api.get(`/enrollments/courses/${courseId}`);
  return response.data;
}

export async function updateEnrollmentStatus(id, status) {
  const response = await api.patch(`/enrollments/${id}/status`, {
    status,
  });
  return response.data;
}
