"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/utils";
import { Sparkles, ArrowLeft, TrendingUp, Target, Zap, BookOpen, Lightbulb, ChevronDown, ChevronUp, Award, AlertCircle, ThumbsUp, MessageSquare } from "lucide-react";
import Link from "next/link";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Customized,
} from "recharts";

function ReportPageContent() {
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("id");
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fromHistory, setFromHistory] = useState(false);
  const [expandedDimensions, setExpandedDimensions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof document !== "undefined") {
      setFromHistory(document.referrer.includes("/history"));
    }
  }, []);
  useEffect(() => {
    if (!interviewId) {
      setError("缺少面试记录 ID，请从面试页面进入");
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/interview/${interviewId}/report`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 400 ? "面试尚未完成" : "获取报告失败");
        return r.json();
      })
      .then((data) => {
        setReport(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "获取报告失败");
        setLoading(false);
      });
  }, [interviewId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-white flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-8 h-8 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">AI 正在生成面试报告...</p>
        </div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">无法获取报告</h2>
          <p className="text-muted-foreground mb-6">{error || "报告数据为空"}</p>
          <Link
            href={fromHistory ? "/history" : "/"}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4" /> {fromHistory ? "返回历史" : "返回首页"}
          </Link>
        </div>
      </main>
    );
  }

  const radarData = report.dimension_scores
	    ? Object.entries(report.dimension_scores).map(([name, score]) => ({
	        dimension: name,
	        score,
	        fullMark: 100,
	      }))
	    : [];

	  // 维度配色方案：根据得分映射颜色
	  const dimensionColors: Record<string, { bg: string; text: string; bar: string; border: string }> = {};
	  const colorPalette = [
	    { bg: "bg-primary/5", text: "text-primary", bar: "bg-primary", border: "border-primary/20" },
	    { bg: "bg-purple-50", text: "text-purple-700", bar: "bg-purple-500", border: "border-purple-200" },
	    { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500", border: "border-emerald-200" },
	    { bg: "bg-orange-50", text: "text-orange-700", bar: "bg-orange-500", border: "border-orange-200" },
	    { bg: "bg-cyan-50", text: "text-cyan-700", bar: "bg-cyan-500", border: "border-cyan-200" },
	    { bg: "bg-pink-50", text: "text-pink-700", bar: "bg-pink-500", border: "border-pink-200" },
	    { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500", border: "border-amber-200" },
	    { bg: "bg-indigo-50", text: "text-indigo-700", bar: "bg-indigo-500", border: "border-indigo-200" },
	  ];

	  // 得分等级颜色
	  const getScoreColor = (score: number) => {
	    if (score >= 80) return { bg: "bg-green-50", text: "text-green-600", dot: "bg-green-500" };
	    if (score >= 60) return { bg: "bg-yellow-50", text: "text-yellow-600", dot: "bg-yellow-500" };
	    return { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" };
	  };

	  // 将建议按维度归类
  const categorizeSuggestions = () => {
    const suggestions = report.improvement_suggestions || {};
    const dimensions = Object.keys(report.dimension_scores || {});
    const categorized: Record<string, string[]> = {};
    const uncategorized: string[] = [];

    // 初始化每个维度
    dimensions.forEach((d) => { categorized[d] = []; });

    if (Array.isArray(suggestions)) {
      // 旧格式：扁平列表，按关键词匹配
      suggestions.forEach((s: string) => {
        let matched = false;
        for (const dim of dimensions) {
          if (s.includes(dim) || dim.split(/[、，,\s]+/).some((kw) => kw.length > 1 && s.includes(kw))) {
            categorized[dim].push(s);
            matched = true;
            break;
          }
        }
        if (!matched) {
          uncategorized.push(s);
        }
      });
    } else if (typeof suggestions === "object") {
      // 新格式：{维度名: [建议列表]}，直接映射
      Object.entries(suggestions).forEach(([dim, list]) => {
        const arr = list as string[];
        if (categorized.hasOwnProperty(dim)) {
          categorized[dim] = arr;
        } else {
          uncategorized.push(...arr);
        }
      });
    }

    return { categorized, uncategorized };
  };

	  const { categorized, uncategorized } = categorizeSuggestions();

  const hasValidData = report.total_score > 0 || (report.question_reviews && report.question_reviews.length > 0);

  // 计算统计数据
  const dimensionScores = Object.values(report.dimension_scores || {}) as number[];
  const avgDimensionScore = dimensionScores.length > 0
    ? Math.round(dimensionScores.reduce((a: number, b: number) => a + b, 0) / dimensionScores.length)
    : 0;
  const questionCount = report.question_reviews?.length || 0;
  const dimensionCount = Object.keys(report.dimension_scores || {}).length;
  const avgQuestionScore = questionCount > 0
    ? Math.round(report.question_reviews.reduce((a: number, r: any) => a + (r.score || 0), 0) / questionCount)
    : 0;
  const topDimension = dimensionScores.length > 0
    ? Object.entries(report.dimension_scores || {}).sort((a: any, b: any) => b[1] - a[1])[0]
    : null;
  const lowDimension = dimensionScores.length > 0
    ? Object.entries(report.dimension_scores || {}).sort((a: any, b: any) => a[1] - b[1])[0]
    : null;

  // 雷达图自定义标签
  const renderRadarLabels = (props: any) => {
    const { cx, cy, polarAngles, polarRadius, data } = props;
    if (!data || !polarAngles) return null;
    return data.map((entry: any, index: number) => {
      const angle = polarAngles[index];
      const radius = polarRadius(entry.score);
      const x = cx + radius * Math.cos(-angle + Math.PI / 2);
      const y = cy - radius * Math.sin(-angle + Math.PI / 2);
      return (
        <g key={index}>
          <circle cx={x} cy={y} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
          <text x={x} y={y - 10} textAnchor="middle" fill="#1e40af" fontSize={12} fontWeight={700}>
            {entry.score}
          </text>
        </g>
      );
    });
  };


  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <Link href={fromHistory ? "/history" : "/"} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> {fromHistory ? "返回历史" : "返回首页"}
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Score Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">面试报告</h1>
          <p className="text-muted-foreground">{report.position || "AI 模拟面试"}</p>
          <div className="mt-6 relative inline-flex items-center justify-center">
            {/* 环形进度背景 */}
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="6" />
              <circle
                cx="60" cy="60" r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 54}`}
                strokeDashoffset={`${2 * Math.PI * 54 * (1 - (report.total_score ?? 0) / 100)}`}
                className="text-primary transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/20 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold leading-none">{report.total_score ?? 0}</span>
                <span className="text-xs opacity-80 mt-0.5">/ 100</span>
              </div>
            </div>
          </div>
          {report.total_score === 0 && (
            <p className="text-sm text-amber-600 mt-3">对话数据不足，评分仅供参考</p>
          )}
          {report.total_score > 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              {report.total_score >= 85 ? "表现优秀，继续保持！" : report.total_score >= 70 ? "表现良好，仍有提升空间" : report.total_score >= 50 ? "基本达标，需要针对性加强" : "还需要更多准备，加油！"}
            </p>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Award className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">{report.total_score ?? 0}</p>
            <p className="text-xs text-muted-foreground">综合评分</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
            <div className="w-8 h-8 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-2">
              <MessageSquare className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-purple-600">{questionCount}</p>
            <p className="text-xs text-muted-foreground">答题数量</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
            <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-2">
              <Target className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-emerald-600">{dimensionCount}</p>
            <p className="text-xs text-muted-foreground">考察维度</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
            <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-600">{avgDimensionScore}</p>
            <p className="text-xs text-muted-foreground">维度均分</p>
          </div>
        </div>

        {/* 面试关键词 */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <span className="text-xs text-muted-foreground">关键词：</span>
          {report.position && (
            <span className="px-2.5 py-1 rounded-full text-xs bg-primary/5 text-primary border border-primary/10">
              {report.position}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full text-xs bg-purple-50 text-purple-600 border border-purple-100">
            {questionCount}轮对话
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-600 border border-emerald-100">
            {dimensionCount}项能力
          </span>
          {report.total_score > 0 && (
            <span className={`px-2.5 py-1 rounded-full text-xs border ${
              report.total_score >= 70
                ? "bg-green-50 text-green-600 border-green-100"
                : "bg-amber-50 text-amber-600 border-amber-100"
            }`}>
              {report.total_score >= 85 ? "优秀" : report.total_score >= 70 ? "良好" : report.total_score >= 50 ? "一般" : "需努力"}
            </span>
          )}
        </div>

        {/* Radar Chart */}
        {radarData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              能力雷达图
              <span className="text-xs text-muted-foreground font-normal ml-auto">满分 100</span>
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickCount={5} />
                  <Radar
                    name="得分"
                    dataKey="score"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Customized component={renderRadarLabels} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {/* 维度分数标签 */}
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {radarData.map((item: any, i: number) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-50 border">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {item.dimension}: <strong>{item.score}</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 维度分析卡片 */}
        <div className="flex flex-wrap gap-4 mb-8">
          {topDimension && (
            <div className="flex-1 min-w-[220px] bg-white rounded-2xl shadow-sm border border-emerald-200 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                  <ThumbsUp className="w-4 h-4 text-emerald-600" />
                </div>
                <h4 className="text-sm font-semibold text-emerald-700">优势维度</h4>
              </div>
              <p className="text-lg font-bold text-emerald-600 mt-1">{topDimension[0]}</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold text-emerald-500">{topDimension[1] as number}</span>
                <span className="text-sm text-emerald-400">分</span>
              </div>
              <div className="w-full h-2 bg-emerald-100 rounded-full mt-3">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${topDimension[1]}%` }} />
              </div>
              <p className="text-xs text-emerald-600/70 mt-2">
                {Number(topDimension[1]) >= 80 ? '该维度表现突出，是你的核心竞争力' : Number(topDimension[1]) >= 60 ? '该维度表现良好，继续保持' : '有提升空间，但相对其他维度表现较好'}
              </p>
            </div>
          )}
          {lowDimension && (
            <div className="flex-1 min-w-[220px] bg-white rounded-2xl shadow-sm border border-amber-200 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                </div>
                <h4 className="text-sm font-semibold text-amber-700">待提升维度</h4>
              </div>
              <p className="text-lg font-bold text-amber-600 mt-1">{lowDimension[0]}</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold text-amber-500">{lowDimension[1] as number}</span>
                <span className="text-sm text-amber-400">分</span>
              </div>
              <div className="w-full h-2 bg-amber-100 rounded-full mt-3">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${lowDimension[1]}%` }} />
              </div>
              <p className="text-xs text-amber-600/70 mt-2">
                {Number(lowDimension[1]) < 40 ? '需要重点加强，建议优先投入学习时间' : Number(lowDimension[1]) < 60 ? '有较大提升空间，建议针对性练习' : '接近及格线，稍加努力即可明显改善'}
              </p>
            </div>
          )}
          {dimensionCount > 0 && (
            <div className="flex-1 min-w-[220px] bg-white rounded-2xl shadow-sm border border-blue-200 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Zap className="w-4 h-4 text-blue-600" />
                </div>
                <h4 className="text-sm font-semibold text-blue-700">维度均分</h4>
              </div>
              <p className="text-lg font-bold text-blue-600 mt-1">综合能力</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold text-blue-500">{avgDimensionScore}</span>
                <span className="text-sm text-blue-400">分</span>
              </div>
              <div className="w-full h-2 bg-blue-100 rounded-full mt-3">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${avgDimensionScore}%` }} />
              </div>
              <p className="text-xs text-blue-600/70 mt-2">
                {avgDimensionScore >= 70 ? '各维度发展较为均衡，综合能力扎实' : avgDimensionScore >= 50 ? '部分维度需加强，建议制定专项提升计划' : '整体有较大成长空间，持续练习是关键'}
              </p>
            </div>
          )}
        </div>

        {/* Overall Feedback */}
        <div className="relative mb-8">
          <div className="absolute -top-3 left-6 bg-primary text-white text-xs font-medium px-3 py-0.5 rounded-full">
            面试官评语
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-primary/10 pt-6 pb-5 px-6">
            <div className="flex gap-4">
              <span className="text-4xl text-primary/20 leading-none font-serif shrink-0">"</span>
              <p className="text-muted-foreground leading-relaxed text-[15px] pt-2">{report.overall_feedback}</p>
            </div>
          </div>
        </div>

        {/* Question Reviews */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-8">
          <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            答题点评
          </h3>
          <div className="space-y-0">
            {report.question_reviews?.map((review: any, i: number) => {
              const sc = getScoreColor(review.score || 0);
              return (
                <div key={i} className="relative pl-8 pb-6 last:pb-0">
                  {/* 时间线竖线 */}
                  {i < report.question_reviews.length - 1 && (
                    <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-gray-100" />
                  )}
                  {/* 序号圆点 */}
                  <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${sc.dot}`}>
                    {i + 1}
                  </div>
                  <div className="border rounded-xl p-4 bg-gray-50/50">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium flex-1 pr-2">
                        <span className="text-gray-400">Q</span> {review.question}
                      </p>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${sc.bg} ${sc.text}`}>
                        {review.score}分
                      </span>
                    </div>
                    {review.answer && (
                      <div className="mb-3 bg-blue-50/50 rounded-lg p-3 border-l-2 border-blue-300">
                        <p className="text-xs text-blue-500 font-medium mb-1">你的回答</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{review.answer}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      <div className="bg-green-50/70 rounded-lg p-3">
                        <p className="text-xs text-green-600 font-medium mb-0.5">✅ 优点</p>
                        <p className="text-sm text-green-800">{review.strength || "暂无评价"}</p>
                      </div>
                      <div className="bg-amber-50/70 rounded-lg p-3">
                        <p className="text-xs text-amber-600 font-medium mb-0.5">💡 改进建议</p>
                        <p className="text-sm text-amber-800">{review.improvement || "暂无建议"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {(!report.question_reviews || report.question_reviews.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">暂无答题点评数据</p>
            )}
          </div>
        </div>

        {/* Improvement Suggestions */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            针对性学习建议
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            以下建议已按能力维度归类，帮助你明确各方向的提升重点
          </p>

          {/* 维度卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(report.dimension_scores || {}).map(([dimName, score], idx) => {
              const dimScore = score as number;
              const scoreColor = getScoreColor(dimScore);
              const palette = colorPalette[idx % colorPalette.length];
              const dimSuggestions = categorized[dimName] || [];
              const isExpanded = expandedDimensions[dimName] ?? true;

              return (
                <div
                  key={dimName}
                  className={`rounded-xl border ${palette.border} ${palette.bg} overflow-hidden transition-all`}
                >
                  {/* 维度头部 */}
                  <button
                    className="w-full text-left p-4 flex items-center justify-between gap-3"
                    onClick={() => setExpandedDimensions((prev) => ({ ...prev, [dimName]: !isExpanded }))}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-sm font-semibold ${palette.text}`}>{dimName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${scoreColor.bg} ${scoreColor.text}`}>
                          {dimScore}分
                        </span>
                      </div>
                      {/* 进度条 */}
                      <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${palette.bar}`}
                          style={{ width: `${dimScore}%` }}
                        />
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {/* 建议列表 */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      {dimSuggestions.length > 0 ? (
                        <ul className="space-y-2">
                          {dimSuggestions.map((suggestion: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center text-xs font-bold text-gray-500 mt-0.5 shrink-0">
                                {i + 1}
                              </span>
                              <span className="text-gray-700">{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {dimScore === 0
                            ? "该维度在本次面试中未涉及，建议通过实际项目积累经验"
                            : dimScore < 50
                            ? "该维度得分偏低，建议系统学习相关知识并多做练习"
                            : "针对该维度的表现，持续练习保持水平即可"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 未归类建议 */}
            {uncategorized.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden md:col-span-2">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-gray-600">综合建议</span>
                  </div>
                  <ul className="space-y-2">
                    {uncategorized.map((suggestion: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-600 mt-0.5 shrink-0">
                          {i + 1}
                        </span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            再试一次 <Sparkles className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    }>
      <ReportPageContent />
    </Suspense>
  );
}