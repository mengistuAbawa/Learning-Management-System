import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle,
  AlertCircle,
  Search,
  Loader,
} from "lucide-react";
import { verifyCertificate } from "../services/certificateService";

/**
 * Public Certificate Verification Page
 * Allows anyone to verify a certificate without logging in.
 * Accessible at /verify-certificate/:code
 */
export default function VerifyCertificate() {
  const { code } = useParams();
  const [searchCode, setSearchCode] = useState(code || "");
  const [loading, setLoading] = useState(!!code);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (code) {
      performVerification(code);
    }
  }, [code]);

  async function performVerification(verificationCode) {
    if (!verificationCode || verificationCode.trim().length === 0) {
      setError("Please enter a certificate code");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const verification = await verifyCertificate(verificationCode.trim());
      setResult(verification);

      if (!verification.valid) {
        setError(
          "Certificate not found. Please check the code and try again."
        );
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to verify certificate. Please try again later."
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    performVerification(searchCode);
  }

  const isValid = result?.valid;
  const certificate = result?.certificate;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-12 dark:from-slate-900 dark:to-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-block rounded-full bg-blue-100 p-3 dark:bg-blue-950">
            <CheckCircle className="text-blue-600 dark:text-blue-400" size={32} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Verify Certificate
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Verify the authenticity of a LearnSphere LMS certificate
          </p>
        </div>

        {/* Search Form */}
        <form
          onSubmit={handleSearch}
          className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="certificate-code"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Certificate Code
              </label>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Enter the verification code from your certificate
              </p>
            </div>

            <div className="flex gap-2">
              <input
                id="certificate-code"
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 dark:focus:border-blue-400"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
              >
                {loading ? (
                  <>
                    <Loader className="animate-spin" size={16} />
                    Verifying
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Verify
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Results */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950">
            <div className="flex gap-4">
              <AlertCircle className="shrink-0 text-red-600 dark:text-red-400" size={24} />
              <div>
                <h2 className="font-semibold text-red-900 dark:text-red-100">
                  Verification Failed
                </h2>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {loading && !result && (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
            <Loader className="mx-auto animate-spin text-slate-400" size={32} />
            <p className="mt-4 text-slate-600 dark:text-slate-400">
              Verifying certificate...
            </p>
          </div>
        )}

        {isValid && certificate && (
          <div className="space-y-6">
            {/* Valid Badge */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
              <div className="flex gap-4">
                <CheckCircle className="shrink-0 text-green-600 dark:text-green-400" size={24} />
                <div>
                  <h2 className="font-semibold text-green-900 dark:text-green-100">
                    Certificate Verified
                  </h2>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                    This is a valid LearnSphere LMS certificate.
                  </p>
                </div>
              </div>
            </div>

            {/* Certificate Details */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                Certificate Details
              </h3>

              <div className="space-y-4">
                {/* Student */}
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Student
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {certificate.student_name}
                  </p>
                </div>

                {/* Course */}
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Course
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {certificate.course_title}
                  </p>
                  {certificate.course_level && (
                    <p className="mt-1 text-sm capitalize text-slate-600 dark:text-slate-400">
                      Level: {certificate.course_level}
                    </p>
                  )}
                </div>

                {/* Instructor */}
                {certificate.instructor_name && (
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Instructor
                    </p>
                    <p className="mt-1 text-slate-900 dark:text-white">
                      {certificate.instructor_name}
                    </p>
                  </div>
                )}

                {/* Issue Date */}
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Issued
                  </p>
                  <p className="mt-1 text-slate-900 dark:text-white">
                    {new Date(certificate.issued_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>

                {/* Verification Code */}
                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Verification Code
                  </p>
                  <p className="mt-1 font-mono text-sm text-slate-900 dark:text-white break-all">
                    {certificate.code}
                  </p>
                </div>
              </div>
            </div>

            {/* Information */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              <p>
                This certificate was issued by <strong>LearnSphere LMS</strong> upon completion of the course requirements.
              </p>
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
            <Search className="mx-auto text-slate-300 dark:text-slate-700" size={48} />
            <p className="mt-4 text-slate-600 dark:text-slate-400">
              Enter a certificate code above to verify
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
