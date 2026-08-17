"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex items-center justify-center min-h-screen font-sans">
          <div className="text-center">
            <h1 className="text-primary text-xl font-bold">系统错误</h1>
            <p className="text-muted-foreground mb-4">{error.message || "发生了未知错误"}</p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
            >
              重试
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}