
import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Courses from "./pages/Courses";
import CourseContent from "./pages/CourseContent";
import MyLearning from "./pages/MyLearning";
import CourseEnrollments from "./pages/CourseEnrollments";
import QuizTake from "./pages/QuizTake";
import QuizManagement from "./pages/QuizManagement";
import CourseAssignments from "./pages/CourseAssignments";
import Notifications from "./pages/Notifications";
import Analytics from "./pages/Analytics";

import ProtectedRoute, {
  PageLoader,
  RoleRoute,
} from "./components/ProtectedRoute";

import { useAuth } from "./context/AuthContext";

function HomeRedirect() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  return (
    <Navigate
      to={isAuthenticated ? "/dashboard" : "/login"}
      replace
    />
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Error 404
        </p>

        <h1 className="mt-4 text-4xl font-bold">
          Page not found
        </h1>

        <p className="mt-3 text-slate-400">
          The page you are looking for does not exist.
        </p>

        <button
          type="button"
          onClick={() => window.location.assign("/")}
          className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold transition hover:bg-indigo-500"
        >
          Back to Home
        </button>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Routes requiring authentication */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/analytics" element={<Analytics />} />

        {/* Courses and learning */}
        <Route path="/courses" element={<Courses />} />

        <Route
          path="/courses/:courseId/learn"
          element={<CourseContent />}
        />

        <Route
          path="/my-learning"
          element={<MyLearning />}
        />

        <Route
          path="/courses/:courseId/enrollments"
          element={<CourseEnrollments />}
        />

        {/* Quizzes */}
        <Route
          path="/quizzes/:quizId/take"
          element={<QuizTake />}
        />

        <Route
          path="/courses/:courseId/quizzes/manage"
          element={
            <RoleRoute allowedRoles={["instructor", "admin"]}>
              <QuizManagement />
            </RoleRoute>
          }
        />

        {/* Assignments */}
        <Route
          path="/courses/:courseId/assignments"
          element={<CourseAssignments />}
        />

        {/* Role-based dashboards */}
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <Dashboard />
            </RoleRoute>
          }
        />
        <Route
          path="/instructor"
          element={
            <RoleRoute allowedRoles={["instructor", "admin"]}>
              <Dashboard />
            </RoleRoute>
          }
        />

        <Route
          path="/student"
          element={
            <RoleRoute allowedRoles={["student"]}>
              <Dashboard />
            </RoleRoute>
          }
        />
      </Route>

      {/* Fallback route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
