"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { API_BASE } from "@/lib/utils";
import { toast } from "sonner";
import { Send, Mic, MicOff, Volume2, VolumeX, Pause, Play, ArrowLeft, Sparkles, Upload, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

interface Message {
  role: "interviewer" | "candidate";
  content: string;
}

export default function InterviewPage() {
  const searchParams = useSearchParams();
  const position = searchParams.get("position") || "产品经理";
  const { token } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [interviewId, setInterviewId] = useState<number | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [roundNumber, setRoundNumber] = useState(0);
  const [maxRounds, setMaxRounds] = useState(3);
  // 简历上传
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeAnalysis, setResumeAnalysis] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  // 全屏加载遮罩（用于耗时操作的用户反馈）
  const [loadingOverlay, setLoadingOverlay] = useState<{
    show: boolean;
    title: string;
    steps: string[];
    currentStep: number;
  }>({ show: false, title: "", steps: [], currentStep: 0 });
  const overlayTimerRef = useRef<any>(null);
  // 从 localStorage 加载上次填写的信息
  const loadSavedProfile = () => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("ai_interview_profile");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  };

  // 每个字段的历史记录（用于下拉提示）
  const FIELD_HISTORY_KEY = "ai_interview_field_history";
  const loadFieldHistory = (): Record<string, string[]> => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(FIELD_HISTORY_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  };

  const [fieldHistory, setFieldHistory] = useState<Record<string, string[]>>(loadFieldHistory);

  // 首次加载：把旧的 profile 数据迁移到字段历史中
  useEffect(() => {
    const savedProfile = loadSavedProfile();
    const history = loadFieldHistory();
    let changed = false;
    const fieldKeys = ["target_industry", "school", "degree", "graduation_year", "target_city", "target_position"];
    fieldKeys.forEach((key) => {
      const val = savedProfile[key];
      if (val && typeof val === "string" && val.trim()) {
        if (!history[key]) history[key] = [];
        if (!history[key].includes(val)) {
          history[key] = [val, ...history[key]].slice(0, 5);
          changed = true;
        }
      }
    });
    if (changed) {
      setFieldHistory(history);
      try {
        localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(history));
      } catch {}
    }
  }, []);

  const [profile, setProfile] = useState(() => ({
    target_position: position,
    target_industry: "",
    school: "",
    degree: "",
    graduation_year: "",
    target_city: "",
    personal_summary: "",
    ...loadSavedProfile(),
    target_position: position,  // 岗位始终跟随 URL 参数
  }));
  const [showProfileForm, setShowProfileForm] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const hasSavedData = Object.values(loadSavedProfile()).some((v) => v && typeof v === "string");

  // 保存字段历史（用于下拉提示）
  const saveFieldHistory = useCallback((field: string, value: string) => {
    if (!value.trim()) return;
    const history = { ...loadFieldHistory() };
    const values = history[field] || [];
    const updated = [value, ...values.filter((v) => v !== value)].slice(0, 5);
    history[field] = updated;
    setFieldHistory(history);
    try {
      localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(history));
    } catch {}
  }, []);

  // 每次修改 profile 时自动保存到 localStorage
  const updateProfile = useCallback((patch: Partial<typeof profile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("ai_interview_profile", JSON.stringify(next));
      } catch {}
      return next;
    });
    // 保存字段历史记录
    Object.entries(patch).forEach(([key, value]) => {
      if (typeof value === "string") saveFieldHistory(key, value);
    });
  }, [saveFieldHistory]);

  const clearSavedProfile = () => {
    localStorage.removeItem("ai_interview_profile");
    localStorage.removeItem(FIELD_HISTORY_KEY);
    setFieldHistory({});
    setProfile({
      target_position: position,
      target_industry: "",
      school: "",
      degree: "",
      graduation_year: "",
      target_city: "",
      personal_summary: "",
    });
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const recordingTimerRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const inputRef = useRef(input);
  inputRef.current = input;  // 始终保持最新值，避免闭包问题
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef(0);        // 开始录音时的光标位置
  const textAfterCursorRef = useRef(""); // 光标之后的文本

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ========== 语音识别（仅手动停止，浏览器静默关闭后自动续接） ==========

  // 创建一个新的语音识别实例并绑定事件（可复用，onend 自动续接时也调用）
  const createRecognition = useCallback((): any => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript.replace(/[。，！？、,.!?]+$/g, "").trim();
        } else {
          interimTranscript += transcript;
        }
      }

      finalTranscriptRef.current += finalTranscript;
      setInput(finalTranscriptRef.current + interimTranscript + textAfterCursorRef.current);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") return;
      console.error("语音识别错误:", event.error);
      stopRecordingInternal();
    };

    recognition.onend = () => {
      // 只有用户手动停止时 recognitionRef 才会被清空
      if (recognitionRef.current) {
        // 浏览器因静默关闭了识别 → 创建全新实例自动续接
        const newRecognition = createRecognition();
        if (newRecognition) {
          recognitionRef.current = newRecognition;
          try {
            newRecognition.start();
          } catch {
            stopRecordingInternal();
          }
        }
      }
    };

    return recognition;
  }, []);

  const startRecording = useCallback(() => {
    const recognition = createRecognition();
    if (!recognition) {
      toast.error("您的浏览器不支持语音识别，请使用 Chrome 浏览器");
      return;
    }

    // 捕获光标位置，在光标处插入语音识别内容
    const el = textareaRef.current;
    if (el) {
      cursorPosRef.current = el.selectionStart;
      textAfterCursorRef.current = inputRef.current.slice(el.selectionStart);
      finalTranscriptRef.current = inputRef.current.slice(0, el.selectionStart);
    } else {
      cursorPosRef.current = inputRef.current.length;
      textAfterCursorRef.current = "";
      finalTranscriptRef.current = inputRef.current;
    }

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setRecordingDuration(0);

    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }, [createRecognition]);

  const stopRecordingInternal = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    // 确保最终文本被填入（保留光标后的文本）
    if (finalTranscriptRef.current) {
      setInput(finalTranscriptRef.current + textAfterCursorRef.current);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecordingInternal();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecordingInternal]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (overlayTimerRef.current) clearInterval(overlayTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  // ========== 全屏加载遮罩 ==========
  const showLoadingOverlay = (title: string, steps: string[]) => {
    setLoadingOverlay({ show: true, title, steps, currentStep: 0 });
    // 定时切换步骤提示
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

  // ========== 面试流程 ==========
  const startInterview = async () => {
    setIsStarting(true);
    showLoadingOverlay("正在准备面试", [
      "正在分析你的个人背景...",
      "正在匹配岗位能力模型...",
      "AI 面试官正在准备中...",
    ]);
    try {
      const res = await fetch(`${API_BASE}/interview/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          position: profile.target_position,
          guest_session_id: token ? null : crypto.randomUUID(),
          target_industry: profile.target_industry,
          school: profile.school,
          degree: profile.degree,
          graduation_year: profile.graduation_year,
          target_city: profile.target_city,
          personal_summary: profile.personal_summary,
          // 将简历分析结果传给面试官，让它了解候选人的项目经历
          resume_data: resumeAnalysis?.parsed_data || null,
          skill_gaps: resumeAnalysis?.skill_gaps || [],
          recommended_focus: resumeAnalysis?.recommended_focus || [],
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "面试启动失败");
      }
      const data = await res.json();
      setMessages([{ role: "interviewer", content: data.content }]);
      setSessionKey(data.session_key || null);
      setInterviewId(data.interview_id || null);
      setRoundNumber(data.round_number || 1);
      setMaxRounds(data.max_rounds || 12);
      setShowProfileForm(false);
    } catch (e: any) {
      hideLoadingOverlay();
      toast.error("面试启动失败：" + (e.message || "请检查后端服务是否运行"));
    } finally {
      setIsStarting(false);
      hideLoadingOverlay();
    }
  };

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || isLoading || isComplete) return;

    const userMsg: Message = { role: "candidate", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/interview/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          interview_id: interviewId,
          session_key: sessionKey,
          message: userMsg.content,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "请求失败");
      }
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "interviewer", content: data.content },
      ]);
      setRoundNumber(data.round_number || 0);
      if (data.is_complete) {
        setIsComplete(true);
        toast.success("面试结束！AI 正在生成评分报告...");
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "interviewer",
          content: "抱歉，系统出现了一些问题：" + (e.message || "请稍后重试"),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 提前结束面试并生成报告
  const endInterview = async () => {
    if (!interviewId || isEnding) return;
    setShowEndModal(false);

    setIsEnding(true);
    showLoadingOverlay("正在生成面试报告", [
      "正在整理面试对话记录...",
      "AI 正在逐题分析你的回答质量...",
      "正在生成各维度评分...",
      "正在撰写针对性学习建议...",
      "即将跳转到报告页...",
    ]);
    try {
      const res = await fetch(`${API_BASE}/interview/${interviewId}/end`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "操作失败");
      }
      stopTTS();
      window.location.href = `/report?id=${interviewId}`;
    } catch (e: any) {
      hideLoadingOverlay();
      toast.error("生成报告失败：" + (e.message || "请稍后重试"));
    } finally {
      setIsEnding(false);
    }
  };

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);

  // 播放语音（使用浏览器内置 TTS，支持暂停/恢复/断点续播）
  const playTTS = (text: string, msgIndex: number) => {
    if (!("speechSynthesis" in window)) {
      toast.error("您的浏览器不支持语音播报，请使用 Chrome 浏览器");
      return;
    }

    // 剥离 HTML 标签和实体，提取纯文本用于语音播报
    const cleanText = text
      .replace(/<[^>]*>/g, "")           // 移除 HTML 标签
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    // 场景1：同一消息正在播放 → 暂停
    if (isSpeaking && !isPaused && speakingMsgIndex === msgIndex) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      return;
    }

    // 场景2：同一消息已暂停 → 从断点恢复
    if (isPaused && speakingMsgIndex === msgIndex) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      return;
    }

    // 场景3：不同消息或新播放 → 取消旧的，开始新的
    window.speechSynthesis.cancel();
    // 给 cancel 一点时间生效（Chrome 的异步行为）
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "zh-CN";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setSpeakingMsgIndex(null);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setSpeakingMsgIndex(null);
      };
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeakingMsgIndex(msgIndex);
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  // 停止语音播报
  const stopTTS = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setSpeakingMsgIndex(null);
  };

  // 页面离开时自动停止语音播报
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // 格式化录音时长
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ========== 画像表单 ==========
  if (showProfileForm) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-white flex items-center justify-center p-4">
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
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> 返回首页
          </Link>
          <h2 className="text-2xl font-bold mb-2">开始面试前，完善你的信息</h2>
          <p className="text-muted-foreground mb-6">
            AI 面试官会根据这些信息调整面试策略
            {hasSavedData && (
              <span className="text-xs text-green-600 ml-2">(已自动填入上次信息)</span>
            )}
          </p>

          {position && (
            <div className="bg-primary/5 border border-primary/10 rounded-lg px-4 py-3 mb-5 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-primary">
                已选择岗位：<strong>{position}</strong>
              </span>
            </div>
          )}

          {/* 字段历史 datalist */}
          <datalist id="industry-list">
            {fieldHistory.target_industry?.map((v, i) => (
              <option key={i} value={v} />
            ))}
          </datalist>
          <datalist id="school-list">
            {fieldHistory.school?.map((v, i) => (
              <option key={i} value={v} />
            ))}
          </datalist>
          <datalist id="degree-list">
            {fieldHistory.degree?.map((v, i) => (
              <option key={i} value={v} />
            ))}
          </datalist>
          <datalist id="year-list">
            {fieldHistory.graduation_year?.map((v, i) => (
              <option key={i} value={v} />
            ))}
          </datalist>
          <datalist id="city-list">
            {fieldHistory.target_city?.map((v, i) => (
              <option key={i} value={v} />
            ))}
          </datalist>
          <datalist id="position-list">
            {fieldHistory.target_position?.map((v, i) => (
              <option key={i} value={v} />
            ))}
          </datalist>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">目标岗位</label>
              <input
                value={profile.target_position}
                onChange={(e) => updateProfile({ target_position: e.target.value })}
                list="position-list"
                autoComplete="organization-title"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">目标行业</label>
              <input
                value={profile.target_industry}
                onChange={(e) => updateProfile({ target_industry: e.target.value })}
                placeholder="如 手机/智能硬件"
                list="industry-list"
                autoComplete="organization"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">毕业院校</label>
                <input
                  value={profile.school}
                  onChange={(e) => updateProfile({ school: e.target.value })}
                  list="school-list"
                  autoComplete="organization"
                  placeholder="桂林电子科技大学"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">学历</label>
                <input
                  value={profile.degree}
                  onChange={(e) => updateProfile({ degree: e.target.value })}
                  placeholder="本科/硕士"
                  list="degree-list"
                  autoComplete="education-level"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">毕业年份</label>
                <input
                  value={profile.graduation_year}
                  onChange={(e) => updateProfile({ graduation_year: e.target.value })}
                  placeholder="2027"
                  list="year-list"
                  autoComplete="off"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">期望城市</label>
                <input
                  value={profile.target_city}
                  onChange={(e) => updateProfile({ target_city: e.target.value })}
                  placeholder="深圳"
                  list="city-list"
                  autoComplete="address-level1"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                个人情况简述
              </label>
              <textarea
                value={profile.personal_summary}
                onChange={(e) => updateProfile({ personal_summary: e.target.value })}
                placeholder="简单描述你的实习经历、项目经历、技能特长..."
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* 简历上传 */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" />
                上传简历（可选）
              </label>
              {resumeAnalysis ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <p className="text-green-700 font-medium mb-1">
                    简历分析完成 · 匹配度 {resumeAnalysis.match_score}%
                  </p>
                  <p className="text-green-600 text-xs">{resumeAnalysis.analysis_summary}</p>
                  <button
                    onClick={() => {
                    if (window.confirm("确定要重新上传吗？\n\n当前简历分析结果将会丢失，需要重新上传文件并等待分析。")) {
                      setResumeFile(null);
                      setResumeAnalysis(null);
                    }
                  }}
                    className="mt-2 text-xs text-green-600 underline"
                  >
                    重新上传
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors text-sm text-muted-foreground">
                    <Upload className="w-4 h-4" />
                    {resumeFile ? resumeFile.name : "点击选择 PDF/DOCX 文件（不超过10MB）"}
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error("文件大小不能超过 10MB");
                          return;
                        }
                        const ext = file.name.split(".").pop()?.toLowerCase();
                        if (!["pdf", "docx", "doc"].includes(ext || "")) {
                          toast.error("仅支持 PDF、DOCX、DOC 格式");
                          return;
                        }
                        setResumeFile(file);
                        // 自动上传分析
                        setIsUploading(true);
                        showLoadingOverlay("正在分析简历", [
                          "正在解析简历内容...",
                          "AI 正在分析技能匹配度...",
                          "正在生成能力评估...",
                        ]);
                        try {
                          const formData = new FormData();
                          formData.append("file", file);
                          formData.append("position", profile.target_position);
                          formData.append("target_industry", profile.target_industry);
                          formData.append("school", profile.school);
                          formData.append("degree", profile.degree);
                          formData.append("graduation_year", profile.graduation_year);
                          formData.append("target_city", profile.target_city);
                          formData.append("personal_summary", profile.personal_summary);
                          const uploadRes = await fetch(`${API_BASE}/resume/upload`, {
                            method: "POST",
                            headers: token ? { Authorization: `Bearer ${token}` } : {},
                            body: formData,
                          });
                          if (!uploadRes.ok) {
                            const err = await uploadRes.json().catch(() => ({}));
                            throw new Error(err.detail || "上传失败");
                          }
                          const analysis = await uploadRes.json();
                          setResumeAnalysis(analysis);
                          toast.success("简历分析完成！");
                        } catch (e: any) {
                          toast.error(e.message || "简历上传失败，可跳过直接开始面试");
                          setResumeFile(null);
                        } finally {
                          setIsUploading(false);
                          hideLoadingOverlay();
                        }
                      }}
                    />
                  </label>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                上传后 AI 将分析简历匹配度，针对性考察薄弱环节
              </p>
            </div>
            <button
              onClick={startInterview}
              disabled={isStarting || !profile.target_position.trim()}
              title={!profile.target_position.trim() ? "请先填写目标岗位" : ""}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isStarting ? (
                "正在准备面试..."
              ) : !profile.target_position.trim() ? (
                <>
                  <Sparkles className="w-5 h-5" />
                  请先填写目标岗位
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  开始面试
                </>
              )}
            </button>
            <button
              onClick={clearSavedProfile}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              清除已保存的信息
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ========== 面试界面 ==========
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-white flex flex-col">
      {/* 全屏加载遮罩 */}
      {loadingOverlay.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            {/* 动画图标 */}
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
            </div>
            <h3 className="text-lg font-semibold mb-4">{loadingOverlay.title}</h3>
            {/* 步骤提示 */}
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

      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => {
              if (window.confirm("确定要退出面试吗？当前进度将丢失。")) {
                stopTTS();
                window.location.href = "/";
              }
            }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> 退出面试
          </button>
          <span className="font-medium text-sm">
            {position} · AI 模拟面试
            {roundNumber > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                第 {roundNumber}/{maxRounds} 轮
              </span>
            )}
          </span>
          <button
            onClick={() => setShowEndModal(true)}
            disabled={isEnding || isComplete}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isEnding ? (
              <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {isEnding ? "生成中..." : "结束面试"}
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 overflow-y-auto space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "candidate" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === "candidate"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white border shadow-sm"
              }`}
            >
              <p
                className="text-sm leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: msg.content
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                    .replace(/\*(.+?)\*/g, "<em>$1</em>")
                    .replace(/\n/g, "<br/>"),
                }}
              />
              {msg.role === "interviewer" && msg.content && (
                <button
                  onClick={() => playTTS(msg.content, i)}
                  className={`mt-2 flex items-center gap-1 text-xs transition-colors ${
                    speakingMsgIndex === i && isSpeaking && !isPaused
                      ? "text-red-500 hover:text-red-600"
                      : speakingMsgIndex === i && isPaused
                      ? "text-orange-500 hover:text-orange-600"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {speakingMsgIndex === i && isSpeaking && !isPaused ? (
                    <>
                      <Pause className="w-3 h-3" /> 暂停播报
                    </>
                  ) : speakingMsgIndex === i && isPaused ? (
                    <>
                      <Play className="w-3 h-3" /> 继续播报
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3 h-3" /> 语音播报
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border shadow-sm rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 bg-primary/30 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 bg-primary/30 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 bg-primary/30 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
        {isComplete && (
          <div className="text-center py-4">
            {interviewId ? (
              <Link
                href={`/report?id=${interviewId}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                查看面试报告 <Sparkles className="w-4 h-4" />
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">
                面试已结束，但报告数据暂未生成，请稍后从历史记录中查看
              </p>
            )}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white sticky bottom-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            {/* 语音按钮 */}
            <button
              onClick={toggleRecording}
              className={`p-2.5 rounded-full transition-colors relative ${
                isRecording
                  ? "bg-red-100 text-red-500 animate-pulse"
                  : "hover:bg-muted text-muted-foreground"
              }`}
              title={isRecording ? "点击停止录音" : "点击开始语音输入"}
            >
              {isRecording ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            {/* 输入框 - 自动扩展高度 */}
            <div className="flex-1 relative">
              <textarea
                ref={(el) => {
                  (textareaRef as any).current = el;
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 200) + "px";
                  }
                }}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // 自动调整高度
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  isRecording
                    ? `正在聆听... ${formatDuration(recordingDuration)}`
                    : "输入你的回答...（Enter 发送，Shift+Enter 换行）"
                }
                disabled={isLoading}
                rows={1}
                className={`w-full px-4 py-2.5 bg-muted rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 transition-colors resize-none ${
                  isRecording ? "ring-2 ring-red-300 bg-red-50" : ""
                }`}
              />
              {/* 录音时实时显示已识别文本 */}
              {isRecording && input && (
                <div className="absolute -top-7 left-4 text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                  识别中，点击麦克风停止
                </div>
              )}
            </div>

            {/* 发送按钮 */}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-primary text-primary-foreground rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      {/* 确认结束面试模态框 */}
      {showEndModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">确认结束面试？</h3>
              <p className="text-sm text-muted-foreground mt-2">
                AI 将根据已完成的 <strong>{messages.filter(m => m.role === "candidate").length}</strong> 轮对话内容进行评分并生成报告。你可以稍后从历史记录中查看。
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                继续面试
              </button>
              <button
                onClick={endInterview}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
              >
                结束并查看报告
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}