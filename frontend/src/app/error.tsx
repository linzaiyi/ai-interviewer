"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-white">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">出错了</h2>
        <p className="text-muted-foreground mb-4">{error.message || "页面加载失败"}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
        >
          重试
        </button>
      </div>
    </div>
  );
}