/**
 * Certificate Preview Component
 * Displays a professional certificate design.
 * Can be printed to PDF or displayed on screen.
 */

export default function CertificatePreview({ certificate }) {
  if (!certificate) {
    return (
      <div className="flex h-96 items-center justify-center bg-slate-100">
        <p className="text-slate-600">No certificate to display</p>
      </div>
    );
  }

  const issueDate = new Date(certificate.issued_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex justify-center bg-white p-4 dark:bg-slate-950 sm:p-8">
      {/* Certificate */}
      <div
        className="w-full max-w-4xl border-8 border-amber-900 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 p-12 shadow-2xl dark:from-amber-950 dark:via-yellow-950 dark:to-amber-900"
        style={{
          aspectRatio: "16 / 9.6",
        }}
      >
        {/* Certificate Content */}
        <div className="flex h-full flex-col items-center justify-between text-center">
          {/* Header */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-amber-900 dark:text-amber-200">
              ✦ Awarded to ✦
            </div>
            <h2 className="text-2xl font-light text-amber-950 dark:text-amber-100">
              Certificate of Completion
            </h2>
          </div>

          {/* Student Name */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-900 dark:text-amber-200">
              This Certificate is Proudly Presented to
            </p>
            <p className="border-b-2 border-amber-900 px-8 py-2 text-3xl font-semibold text-amber-950 dark:border-amber-300 dark:text-amber-100">
              {certificate.student_name}
            </p>
          </div>

          {/* Course Information */}
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs uppercase tracking-widest text-amber-900 dark:text-amber-200">
              For successfully completing the course
            </p>
            <p className="text-xl font-semibold text-amber-950 dark:text-amber-100">
              {certificate.course_title}
            </p>
            {certificate.course_level && (
              <p className="text-xs capitalize text-amber-800 dark:text-amber-300">
                Level: {certificate.course_level}
              </p>
            )}
            {certificate.instructor_name && (
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Instructor: {certificate.instructor_name}
              </p>
            )}
          </div>

          {/* Bottom Section */}
          <div className="flex w-full items-end justify-between gap-4">
            {/* Verification Code */}
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-900 dark:text-amber-200">
                Verification Code
              </p>
              <p className="mt-1 font-mono text-xs text-amber-950 dark:text-amber-100">
                {certificate.code}
              </p>
            </div>

            {/* Issue Date */}
            <div className="text-center space-y-1">
              <p className="text-xs font-bold uppercase text-amber-900 dark:text-amber-200">
                Issued
              </p>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                {issueDate}
              </p>
            </div>

            {/* LearnSphere Logo/Branding */}
            <div className="text-right">
              <p className="text-xs font-bold uppercase text-amber-900 dark:text-amber-200">
                LearnSphere LMS
              </p>
              <p className="mt-1 text-xs italic text-amber-800 dark:text-amber-300">
                Learning Management System
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white;
            margin: 0;
            padding: 0;
          }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
