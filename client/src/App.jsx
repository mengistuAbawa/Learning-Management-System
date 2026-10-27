import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import StudentDashboard from "./pages/StudentDashboardEnhanced";
import InstructorDashboard from "./pages/InstructorDashboardEnhanced";
import AdminDashboard from "./pages/AdminDashboardEnhanced";
import AdminManagementPage from "./pages/AdminManagementPage";
import Courses from "./pages/Courses";
import CourseContent from "./pages/CourseContent";
import CourseDetail from "./pages/CourseDetail";
import CategoryPage from "./pages/CategoryPage";
import MyLearning from "./pages/MyLearning";
import StudentAssessments from "./pages/StudentAssessments";
import CourseEnrollments from "./pages/CourseEnrollments";
import QuizTake from "./pages/QuizTake";
import QuizManagement from "./pages/QuizManagement";
import QuizGrading from "./pages/QuizGrading";
import CourseAssignments from "./pages/CourseAssignments";
import Notifications from "./pages/Notifications";
import Analytics from "./pages/Analytics";
import MyCertificates from "./pages/MyCertificates";
import VerifyCertificate from "./pages/VerifyCertificate";
import LiveClasses from "./pages/LiveClasses";
import InstructorCalendar from "./pages/InstructorCalendar";
const LiveClassroom = lazy(() => import("./pages/LiveClassroom"));

import ProtectedRoute, {
  PageLoader,
  RoleRoute,
} from "./components/ProtectedRoute";
import RoleWorkspace from "./components/RoleWorkspace";

import { useAuth } from "./context/AuthContext";

function HomeRedirect() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

function NotFound() {
  const navigate = useNavigate();

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

        <button
          type="button"
          onClick={() => navigate("/", { replace: true })}
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
      <Route path="/verify-certificate/:code" element={<VerifyCertificate />} />

      {/* Routes requiring authentication */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/student-dashboard"
          element={
            <RoleRoute allowedRoles={["student"]}>
              <StudentDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="/instructor-dashboard"
          element={
            <RoleRoute allowedRoles={["instructor", "admin"]}>
              <InstructorDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="/admin-dashboard"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="/admin/:section"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AdminManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="/live-classes/:classId/room"
          element={
            <Suspense fallback={<PageLoader />}>
              <LiveClassroom />
            </Suspense>
          }
        />

        <Route element={<RoleWorkspace />}>
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/certificates" element={<MyCertificates />} />
          <Route path="/live-classes" element={<LiveClasses />} />
          <Route
            path="/instructor/calendar"
            element={
              <RoleRoute allowedRoles={["instructor"]}>
                <InstructorCalendar />
              </RoleRoute>
            }
          />

          {/* Courses and learning */}
          <Route path="/courses" element={<Courses />} />
          <Route path="/courses/:courseId/detail" element={<CourseDetail />} />
          <Route
            path="/courses/category/:categoryName"
            element={<CategoryPage />}
          />
          <Route path="/courses/:courseId/learn" element={<CourseContent />} />
          <Route path="/my-learning" element={<MyLearning />} />
          <Route
            path="/my-assessments"
            element={
              <RoleRoute allowedRoles={["student"]}>
                <StudentAssessments />
              </RoleRoute>
            }
          />
          <Route
            path="/courses/:courseId/enrollments"
            element={<CourseEnrollments />}
          />
          <Route
            path="/courses/:courseId/quizzes/manage"
            element={
              <RoleRoute allowedRoles={["instructor", "admin"]}>
                <QuizManagement />
              </RoleRoute>
            }
          />
          <Route
            path="/instructor/quizzes/grading"
            element={
              <RoleRoute allowedRoles={["instructor", "admin"]}>
                <QuizGrading />
              </RoleRoute>
            }
          />
          <Route
            path="/courses/:courseId/assignments"
            element={<CourseAssignments />}
          />
          <Route path="/quizzes/:quizId/take" element={<QuizTake />} />
        </Route>

        {/* Legacy role-based routes (now redirect to proper dashboards) */}
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="/instructor"
          element={
            <RoleRoute allowedRoles={["instructor", "admin"]}>
              <InstructorDashboard />
            </RoleRoute>
          }
        />

        <Route
          path="/student"
          element={
            <RoleRoute allowedRoles={["student"]}>
              <StudentDashboard />
            </RoleRoute>
          }
        />
      </Route>

      {/* Fallback route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
