import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.core.database import engine
from app.models.base import Base
from app.api import auth, profile, resume, interview, positions

settings = get_settings()

# CORS 配置：生产环境从环境变量读取，开发环境允许 localhost
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("LIFESPAN: starting...", flush=True)
    async with engine.begin() as conn:
        print("LIFESPAN: creating tables...", flush=True)
        await conn.run_sync(Base.metadata.create_all)
        print("LIFESPAN: tables created", flush=True)
    print("LIFESPAN: startup complete, yielding...", flush=True)
    yield
    print("LIFESPAN: shutting down...", flush=True)
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
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
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


@app.get("/")
async def root():
    return {"status": "ok", "app": "AI Interviewer"}


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "AI Interviewer", "ver": "fix-oom"}


@app.get("/api/debug/llm-test")
async def debug_llm_test():
    """诊断端点：直接测试 LLM 调用"""
    from app.ai.llm import get_llm
    from langchain_core.messages import HumanMessage, SystemMessage
    import time
    
    print("DEBUG: starting LLM test...", flush=True)
    try:
        llm = get_llm(temperature=0.7)
        print("DEBUG: llm created, invoking...", flush=True)
        t0 = time.time()
        response = llm.invoke([
            SystemMessage(content="你是面试官"),
            HumanMessage(content="回复：你好")
        ])
        elapsed = time.time() - t0
        print(f"DEBUG: LLM ok in {elapsed:.1f}s", flush=True)
        return {"status": "ok", "llm_response": response.content[:200], "elapsed": f"{elapsed:.1f}s"}
    except Exception as e:
        print(f"DEBUG: LLM error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return {"status": "error", "detail": str(e)}