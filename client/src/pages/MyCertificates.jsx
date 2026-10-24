import { useEffect, useState } from "react";
import { FileText, Download, Share2, Eye, Loader, AlertCircle } from "lucide-react";
import {
  getMyCertificates,
  getCertificateDetails,
} from "../services/certificateService";
import CertificatePreview from "../components/CertificatePreview";

/**
 * My Certificates Page
 * Displays all certificates earned by the authenticated student.
 * Allows viewing, downloading, and sharing certificates.
 */
export default function MyCertificates() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadCertificates();
  }, []);

  async function loadCertificates() {
    setLoading(true);
    setError("");
    try {
      const certs = await getMyCertificates();
      setCertificates(certs);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load certificates. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleViewCertificate(certificateId) {
    try {
      const details = await getCertificateDetails(certificateId);
      setSelectedCertificate(details);
      setShowPreview(true);
    } catch (err) {
      alert(
        err.response?.data?.message ||
          "Unable to load certificate details."
      );
    }
  }

  function handleDownloadPDF() {
    if (!selectedCertificate) return;

    // Create a new window for printing
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Certificate - ${selectedCertificate.course_title}</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: 'Georgia', serif;
              background: white;
            }
            @page {
              size: A4 landscape;
              margin: 0;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
            }
            .certificate-container {
              width: 100%;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0;
              box-sizing: border-box;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="certificate-container">
            <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
              <CertificatePreview />
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function handlePrint() {
    window.print();
  }

  function handleShare() {
    if (!selectedCertificate) return;

    const verificationUrl = `${window.location.origin}/verify-certificate/${selectedCertificate.certificate_code}`;
    const text = `I just earned a certificate in ${selectedCertificate.course_title} from LearnSphere LMS! Verify it here: ${verificationUrl}`;

    if (navigator.share) {
      navigator.share({
        title: "LearnSphere Certificate",
        text,
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(verificationUrl);
      alert("Verification URL copied to clipboard!");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8 dark:from-slate-900 dark:to-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-100 p-3 dark:bg-amber-950">
              <FileText className="text-amber-600 dark:text-amber-400" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                My Certificates
              </h1>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                Professional certificates for completed courses
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <div className="flex gap-3">
              <AlertCircle className="shrink-0 text-red-600 dark:text-red-400" size={20} />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
            <Loader className="mx-auto animate-spin text-slate-400" size={32} />
            <p className="mt-4 text-slate-600 dark:text-slate-400">
              Loading your certificates...
            </p>
          </div>
        ) : certificates.length === 0 ? (
          /* Empty State */
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
            <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={48} />
            <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
              No certificates yet
            </h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Complete all lessons in a course to earn your certificate.
            </p>
          </div>
        ) : (
          /* Certificates Grid */
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {certificates.map((cert) => (
                <div
                  key={cert.id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
                >
                  {/* Certificate Card Header */}
                  <div className="bg-gradient-to-r from-amber-50 to-amber-100 px-6 py-4 dark:from-amber-950 dark:to-amber-900">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          Certificate
                        </p>
                        <h3 className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {cert.course_title}
                        </h3>
                      </div>
                      <FileText className="shrink-0 text-amber-600 dark:text-amber-400" size={20} />
                    </div>
                  </div>

                  {/* Certificate Card Body */}
                  <div className="px-6 py-4">
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Student</p>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {cert.student_name}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Instructor</p>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {cert.instructor_name}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Issued</p>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {new Date(cert.issued_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>

                      <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Verification Code
                        </p>
                        <p className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                          {cert.certificate_code}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Certificate Card Actions */}
                  <div className="border-t border-slate-200 px-6 py-3 dark:border-slate-800">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewCertificate(cert.id)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                      >
                        <Eye size={14} />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={handleShare}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                      >
                        <Share2 size={14} />
                        Share
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Refresh Button */}
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={loadCertificates}
                className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Refresh
              </button>
            </div>
          </>
        )}
      </div>

      {/* Certificate Preview Modal */}
      {showPreview && selectedCertificate && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black/50 p-4">
          <div className="mx-auto max-w-4xl rounded-lg bg-white p-6 dark:bg-slate-950 sm:p-8">
            {/* Modal Header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Certificate Preview
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="mb-6">
              <CertificatePreview certificate={selectedCertificate} />
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <FileText size={16} />
                Print
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <Download size={16} />
                Download PDF
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                <Share2 size={16} />
                Share
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="ml-auto rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
