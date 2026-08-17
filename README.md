# AI 智能面试官

AI 驱动的模拟面试平台 —— 基于 Vibe Coding 全栈开发

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | Next.js 14 + React 18 + TypeScript + Tailwind CSS + shadcn/ui |
| 后端 | Python FastAPI + SQLAlchemy 2.0 + Alembic |
| 数据库 | PostgreSQL + Redis |
| AI | DeepSeek + LangChain + Chroma |
| 语音 | Web Speech API (STT) + Edge TTS |
| 部署 | Docker + Vercel + Railway |

## 快速开始

### 1. 启动基础设施

```bash
docker-compose up -d
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入你的 DeepSeek API Key
```

### 3. 启动后端

```bash
cd backend
pip install -r requirements.txt
python -m app.seed          # 导入预设题库
uvicorn app.main:app --reload --port 8000
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000

## 项目结构

```
ai-interviewer/
├── frontend/               # Next.js 前端
│   └── src/
│       ├── app/            # 页面路由
│       │   ├── page.tsx    # 首页
│       │   ├── interview/  # 面试页
│       │   ├── report/     # 报告页
│       │   └── history/    # 历史页
│       ├── components/     # 组件
│       └── lib/            # 工具函数
├── backend/                # FastAPI 后端
│   └── app/
│       ├── api/            # API 路由
│       ├── core/           # 配置、数据库、安全
│       ├── models/         # 数据库模型
│       ├── schemas/        # Pydantic 模型
│       ├── services/       # 业务逻辑
│       ├── ai/             # AI 核心层
│       │   ├── agent.py    # 面试 Agent
│       │   ├── parser.py   # 简历解析
│       │   ├── evaluator.py # 评分器
│       │   ├── rag.py      # RAG 检索
│       │   └── prompts.py  # Prompt 模板
│       └── seed.py         # 种子数据
├── docker-compose.yml      # 本地开发环境
└── README.md
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| POST | /api/profile | 创建/更新画像 |
| GET | /api/profile | 获取画像 |
| POST | /api/resume/upload | 上传简历 |
| GET | /api/positions | 岗位列表 |
| POST | /api/interview/start | 开始面试 |
| POST | /api/interview/chat | 面试对话 |
| GET | /api/interview/history | 面试历史 |
| GET | /api/interview/{id}/evaluation | 面试报告 |
| GET | /api/interview/tts?text=xxx | 语音播报 |
| GET | /api/health | 健康检查 |