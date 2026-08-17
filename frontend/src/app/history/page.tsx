"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { API_BASE } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, History, TrendingUp, ChevronRight, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  const router = useRouter();
  const { token, user, openLoginModal } = useAuth();
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [loadingOverlay, setLoadingOverlay] = useState<{
    show: boolean;
    title: string;
    steps: string[];
    currentStep: number;
  }>({ show: false, title: "", steps: [], currentStep: 0 });
  const overlayTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) clearInterval(overlayTimerRef.current);
    };
  }, []);

  const showLoadingOverlay = (title: string, steps: string[]) => {
    setLoadingOverlay({ show: true, title, steps, currentStep: 0 });
    if (overlayTimerRef.current) clearInterval(overlayTimerRef.current);
    if (steps.length > 1) {
      overlayTimerRef.current = setInterval(() => {
        setLoadingOverlay((prev) => ({
          ...prev,
          currentStep: (prev.currentStep + 1) % steps.length,
        }));
      }, 2000);
    }
  };

  const hideLoadingOverlay = () => {
    if (overlayTimerRef.current) {
      clearInterval(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
    setLoadingOverlay({ show: false, title: "", steps: [], currentStep: 0 });
  };

  useEffect(() => {
    // 只有登录用户才能查看历史记录
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/interview/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setInterviews)
      .catch(() => {
        toast.error("加载失败，请稍后重试");
      })
      .finally(() => setLoading(false));
  }, [token]);

  // 为进行中的面试生成报告
  const generateReport = async (e: React.MouseEvent, interviewId: number) => {
    e.stopPropagation();
    if (generatingId) return;
    setGeneratingId(interviewId);
    showLoadingOverlay("正在生成面试报告", [
      "正在整理面试对话记录...",
      "AI 正在逐题分析回答质量...",
      "正在生成各维度评分...",
      "正在撰写学习建议...",
    ]);
    try {
      const res = await fetch(`${API_BASE}/interview/${interviewId}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "操作失败");
      }
      hideLoadingOverlay();
      toast.success("报告已生成！");
      // 刷新列表，让该记录显示为"已完成"
      const listRes = await fetch(`${API_BASE}/interview/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json();
      setInterviews(listData);
    } catch (e: any) {
      hideLoadingOverlay();
      toast.error("生成报告失败：" + (e.message || "请稍后重试"));
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-white">
      {/* 全屏加载遮罩 */}
      {loadingOverlay.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
            </div>
            <h3 className="text-lg font-semibold mb-4">{loadingOverlay.title}</h3>
            <div className="space-y-2">
              {loadingOverlay.steps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm transition-all duration-500 ${
                    i === loadingOverlay.currentStep
                      ? "text-primary font-medium"
                      : i < loadingOverlay.currentStep
                      ? "text-green-500"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {i < loadingOverlay.currentStep ? (
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : i === loadingOverlay.currentStep ? (
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    </div>
                  )}
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-5">请耐心等待，不要关闭页面</p>
          </div>
        </div>
      )}

      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> 返回首页
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <History className="w-6 h-6 text-primary" />
          面试历史
        </h1>
        <p className="text-muted-foreground mb-8">追踪你的每一次进步</p>

        {!user && !token ? (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
            <History className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">登录后查看面试历史</h3>
            <p className="text-muted-foreground mb-4">注册账号后，你的面试记录将被保存，方便追踪进步</p>
            <button
              onClick={openLoginModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
            >
              去登录
            </button>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : interviews.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">还没有面试记录</h3>
            <p className="text-muted-foreground mb-4">去完成一次模拟面试吧</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
            >
              开始面试
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {interviews.map((interview) => (
              <div
                key={interview.id}
                onClick={() => {
                  if (interview.status === "completed") {
                    router.push(`/report?id=${interview.id}`);
                  }
                }}
                className={`bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between transition-colors ${
                    interview.status === "completed"
                      ? "hover:border-primary/50 cursor-pointer hover:bg-muted/50"
                      : ""
                  }`}
              >
                <div>
                  <h3 className="font-medium">{interview.position}</h3>
                  <p className="text-sm text-muted-foreground">
                    {interview.created_at ? new Date(interview.created_at).toLocaleDateString("zh-CN") : "未知"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {interview.total_score !== null && (
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                      {interview.total_score} 分
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      interview.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {interview.status === "completed" ? "已完成" : "进行中"}
                  </span>
                  {interview.status === "completed" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/report?id=${interview.id}`);
                      }}
                      className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-full hover:opacity-90 transition-opacity"
                    >
                      查看报告
                    </button>
                  )}
                  {interview.status !== "completed" && (
                    <button
                      onClick={(e) => generateReport(e, interview.id)}
                      disabled={generatingId === interview.id}
                      className="px-3 py-1 text-xs bg-amber-500 text-white rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1"
                    >
                      {generatingId === interview.id ? (
                        <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                      生成报告
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}