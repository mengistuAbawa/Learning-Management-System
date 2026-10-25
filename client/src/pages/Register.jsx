import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";

function getErrorMessage(error) {
  const validationErrors = error.response?.data?.errors;

  if (validationErrors?.length) {
    return validationErrors.map((item) => item.message).join(" ");
  }

  return (
    error.response?.data?.message ||
    "Unable to register. Check your connection and try again."
  );
}

export default function Register() {
  const { register, isAuthenticated, loading } = useAuth();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  function handleChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const fullName = form.full_name.trim();
    const email = form.email.trim();

    if (fullName.length < 2 || fullName.length > 150) {
      setError("Your full name must contain between 2 and 150 characters.");
      return;
    }

    if (form.password.length > 128) {
      setError("Your password must not exceed 128 characters.");
      return;
    }

    const strongPassword =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!strongPassword.test(form.password)) {
      setError(
        "Use at least 8 characters, including uppercase, lowercase, a number, and a symbol."
      );
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      // The API assigns the student role. Do not send a role from the client.
      await register({
        full_name: fullName,
        email,
        password: form.password,
      });
      setRegistered(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const passwordRequirements = [
    { label: "At least 8 characters", valid: form.password.length >= 8 },
    { label: "Uppercase and lowercase letters", valid: /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) },
    { label: "At least one number", valid: /\d/.test(form.password) },
    { label: "At least one symbol", valid: /[^A-Za-z0-9]/.test(form.password) },
  ];

  return (
    <AuthLayout mode="register">
      {registered ? (
        <div className="space-y-5 text-center" role="status">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Registration submitted</h1>
            <p className="mt-2 text-sm text-slate-300">
              Your account is waiting for administrator approval. You can sign in once it has been approved.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white transition hover:bg-indigo-400"
          >
            Continue to sign in
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="full_name" className="mb-2 block text-sm font-medium text-slate-200">
            Full name
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={150}
              required
              value={form.full_name}
              onChange={handleChange}
              placeholder="Enter your full name"
              className="w-full rounded-xl border border-white/10 bg-slate-900 py-3.5 pl-12 pr-4 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={255}
              required
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/10 bg-slate-900 py-3.5 pl-12 pr-4 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>
        </div>

        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-medium text-slate-200">
            Account type
          </label>
          <select
            id="role"
            name="role"
            value="student"
            disabled={submitting}
            aria-describedby="role-help"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3.5 text-white outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="student">Student</option>
            <option value="instructor" disabled>
              Instructor (assigned by an admin)
            </option>
            <option value="admin" disabled>
              Admin (created by an admin)
            </option>
          </select>
          <p id="role-help" className="mt-2 text-xs text-slate-500">
            Instructor and admin accounts must be assigned or created by an existing admin.
          </p>
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
            Password
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              maxLength={128}
              required
              value={form.password}
              onChange={handleChange}
              placeholder="Create a strong password"
              className="w-full rounded-xl border border-white/10 bg-slate-900 py-3.5 pl-12 pr-12 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            {passwordRequirements.map((item) => (
              <div key={item.label} className="flex items-start gap-2 text-xs">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    item.valid ? "text-emerald-400" : "text-slate-600"
                  }`}
                />
                <span className={item.valid ? "text-emerald-300" : "text-slate-500"}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-200">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="Enter your password again"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Create student account
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-indigo-300 hover:text-indigo-200">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}