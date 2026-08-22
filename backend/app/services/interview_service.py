import json
import os
import uuid
import asyncio
from app.ai.agent import InterviewAgent
from app.ai.evaluator import Evaluator
from app.core.redis import get_redis

SESSION_TTL = 3600  # 会话过期时间：1小时
REDIS_KEY_PREFIX = "interview:agent:"


def create_session_id() -> str:
    return uuid.uuid4().hex[:16]


async def store_agent(session_key: str, agent: InterviewAgent):
    """将 Agent 序列化到 Redis，设置 1 小时 TTL"""
    redis = await get_redis()
    key = f"{REDIS_KEY_PREFIX}{session_key}"
    data = json.dumps(agent.to_dict(), ensure_ascii=False)
    await redis.setex(key, SESSION_TTL, data)


async def get_agent(session_key: str) -> InterviewAgent | None:
    """从 Redis 恢复 Agent 并更新过期时间"""
    redis = await get_redis()
    key = f"{REDIS_KEY_PREFIX}{session_key}"
    data = await redis.get(key)
    if data is None:
        return None
    # 每次访问续期
    await redis.expire(key, SESSION_TTL)
    return InterviewAgent.from_dict(json.loads(data))


async def remove_agent(session_key: str):
    """从 Redis 删除会话"""
    redis = await get_redis()
    key = f"{REDIS_KEY_PREFIX}{session_key}"
    await redis.delete(key)


async def start_interview(
    position: str,
    profile: dict,
    ability_model: list[dict],
    weakness_areas: list[str],
    resume_data: dict | None = None,
) -> tuple[str, str]:
    """开始面试，返回 (session_key, 开场白)"""
    agent = InterviewAgent(
        position=position,
        profile=profile,
        ability_model=ability_model,
        weakness_areas=weakness_areas,
        resume_data=resume_data,
    )
    opening = await asyncio.to_thread(agent.generate_opening)
    session_key = create_session_id()
    await store_agent(session_key, agent)
    return session_key, opening


async def chat(session_key: str, user_message: str) -> dict:
    """处理面试对话"""
    agent = await get_agent(session_key)
    if not agent:
        raise ValueError("面试会话不存在或已过期")
    try:
        response = await asyncio.to_thread(agent.respond, user_message)
        await store_agent(session_key, agent)
        return response
    except Exception as e:
        import traceback
        print(f"CHAT ERROR: {e}", flush=True)
        traceback.print_exc()
        raise


def end_interview(session_key: str) -> dict:
    """结束面试并评分（同步版本，兼容现有调用）"""
    raise NotImplementedError("请使用 async_end_interview")


async def async_end_interview(session_key: str) -> dict:
    """结束面试并评分"""
    agent = await get_agent(session_key)
    if not agent:
        raise ValueError("面试会话不存在或已过期")

    conversation = agent.get_conversation()
    evaluator = Evaluator()
    result = await asyncio.to_thread(
        evaluator.evaluate,
        agent.position,
        agent.ability_model,
        conversation,
    )
    await remove_agent(session_key)
    return result


async def generate_tts(text: str) -> bytes:
    """使用 Edge TTS 生成语音"""
    import edge_tts
    import tempfile

    communicate = edge_tts.Communicate(text, "zh-CN-XiaoxiaoNeural")
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp_path = f.name
    await communicate.save(tmp_path)
    with open(tmp_path, "rb") as f:
        audio_bytes = f.read()
    os.unlink(tmp_path)
    return audio_bytes