"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { API_BASE } from "@/lib/utils";
import { Sparkles, Mic, BarChart3, History, ArrowRight, User } from "lucide-react";

// 预设岗位兜底数据（后端种子数据未加载时使用）
const FALLBACK_POSITIONS = [
  { id: 1, name: "互联网产品经理", description: "负责产品规划、需求分析、功能设计、项目推进，与研发/设计/运营团队紧密协作" },
  { id: 2, name: "后端开发工程师", description: "负责后端服务架构设计、API开发、数据库设计、性能优化、系统稳定性保障" },
  { id: 3, name: "前端开发工程师", description: "负责Web前端架构设计、组件开发、性能优化、工程化建设" },
  { id: 4, name: "数据分析师", description: "负责数据采集、清洗、分析、可视化，为业务决策提供数据支撑" },
  { id: 5, name: "运营", description: "负责用户运营、内容运营、活动策划、社群管理，驱动用户增长与留存" },
];

export default function HomePage() {
  const router = useRouter();
  const { user, logout, isLoading, openLoginModal } = useAuth();
  const [positions, setPositions] = useState(FALLBACK_POSITIONS);

  useEffect(() => {
    fetch(`${API_BASE}/positions`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.length > 0) setPositions(data);
      })
      .catch(() => {});
  }, []);

  const handleStartInterview = (position: string) => {
    router.push(`/interview?position=${encodeURIComponent(position)}`);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold">AI 智能面试官</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/history")}
              className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="w-4 h-4" />
              面试历史
            </button>
            {isLoading ? null : user ? (
              <button
                onClick={logout}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                退出登录
              </button>
            ) : (
              <button
                onClick={openLoginModal}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                <User className="w-4 h-4" />
                登录 / 注册
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-24 pb-16 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          <span className="block">用 AI 模拟真实面试</span>
          <span className="block text-primary mt-2">让每一次练习都算数</span>
        </h1>

        <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mt-6 leading-relaxed">
          选择目标岗位，AI 面试官会根据你的简历和岗位要求
          <br />
          进行个性化模拟面试，结束后给出分维度评分和改进建议
        </p>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 text-xs text-primary mt-4">
          <Sparkles className="w-3 h-3" />
          AI 驱动
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">语音 + 文字双模式</h3>
            <p className="text-sm text-muted-foreground">支持文字输入和语音输入，模拟真实面试交流场景</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold mb-2">分维度智能评分</h3>
            <p className="text-sm text-muted-foreground">基于岗位能力模型，多维度评估你的面试表现，生成雷达图</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold mb-2">AI 简历解析</h3>
            <p className="text-sm text-muted-foreground">上传简历后，AI 自动分析匹配度，针对性考察薄弱环节</p>
          </div>
        </div>
      </section>

      {/* Position Selection */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-center mb-2">选择目标岗位，开始模拟面试</h2>
        <p className="text-muted-foreground text-center mb-8">无需注册，直接体验</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {positions.map((pos) => (
            <button
              key={pos.id}
              onClick={() => handleStartInterview(pos.name)}
              className="group bg-white rounded-xl p-6 shadow-sm border hover:border-primary hover:shadow-md transition-all text-left"
            >
              <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                {pos.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {pos.description}
              </p>
              <div className="flex items-center gap-1 text-primary text-sm font-medium">
                开始面试 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </section>

    </main>
  );
}