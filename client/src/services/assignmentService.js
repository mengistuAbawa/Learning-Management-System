import api from "./api";

export async function getAssignments(courseId) {
  const response = await api.get(`/courses/${courseId}/assignments`);
  return response.data;
}

export async function createAssignment(courseId, data) {
  const response = await api.post(`/courses/${courseId}/assignments`, data);
  return response.data;
}

export async function submitAssignment(assignmentId, data) {
  const response = await api.post(
    `/assignments/${assignmentId}/submit`,
    data
  );
  return response.data;
}

export async function getAssignmentSubmissions(assignmentId) {
  const response = await api.get(
    `/assignments/${assignmentId}/submissions`
  );
  return response.data;
}

export async function gradeAssignmentSubmission(submissionId, data) {
  const response = await api.patch(
    `/assignment-submissions/${submissionId}/grade`,
    data
  );
  return response.data;
}

export async function getMyAssignmentSubmissions() {
  const response = await api.get("/assignment-submissions/mine");
  return response.data;
}