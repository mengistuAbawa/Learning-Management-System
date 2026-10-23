import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Courses from "./pages/Courses";
import CourseAssignments from "./pages/CourseAssignments";

import ProtectedRoute, {
  PageLoader,
  RoleRoute,
} from "./components/ProtectedRoute";

import { useAuth } from "./context/AuthContext";
import CourseContent from "./pages/CourseContent";
import MyLearning from "./pages/MyLearning";
import CourseEnrollments from "./pages/CourseEnrollments";
function HomeRedirect() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) return <PageLoader />;

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
        <h1 className="mt-4 text-4xl font-bold">Page not found</h1>
        <p className="mt-3 text-slate-400">
          The page you are looking for does not exist.
        </p>
        <Navigate to="/" replace />
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:courseId/learn" element={<CourseContent />} />
        <Route path="/my-learning" element={<MyLearning />} />
        <Route path="/courses/:courseId/enrollments" element={<CourseEnrollments />} />
        <Route
          path="/courses/:courseId/assignments"
          element={<CourseAssignments />}
        />
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

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}