import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute, {
  RoleRoute,
} from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { PageLoader } from "./components/ProtectedRoute";

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
        <a
          href="/"
          className="mt-7 inline-flex rounded-xl bg-indigo-500 px-5 py-3 font-semibold hover:bg-indigo-400"
        >
          Return to LearnSphere
        </a>
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