import api from "./api";

export async function getQuizzes(courseId) {
  const response = await api.get(`/courses/${courseId}/quizzes`);
  return response.data;
}

export async function getQuiz(quizId) {
  const response = await api.get(`/quizzes/${quizId}`);
  return response.data;
}

export async function createQuiz(courseId, data) {
  const response = await api.post(`/courses/${courseId}/quizzes`, data);
  return response.data;
}

export async function addQuestion(quizId, data) {
  const response = await api.post(`/quizzes/${quizId}/questions`, data);
  return response.data;
}

export async function startQuizAttempt(quizId) {
  const response = await api.post(`/quizzes/${quizId}/attempts`);
  return response.data;
}

export async function submitQuizAttempt(attemptId, answers) {
  const response = await api.post(`/quiz-attempts/${attemptId}/submit`, {
    answers,
  });
  return response.data;
}

export async function getMyQuizAttempts() {
  const response = await api.get("/quiz-attempts/mine");
  return response.data;
}