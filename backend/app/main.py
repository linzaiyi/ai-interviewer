from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.core.database import engine
from app.models.base import Base
from app.api import auth, profile, resume, interview, positions

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时创建表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # 关闭时清理
    await engine.dispose()


app = FastAPI(
    title="AI 智能面试官",
    description="AI 驱动的模拟面试平台 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(resume.router)
app.include_router(interview.router)
app.include_router(positions.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "AI Interviewer"}