from langchain_openai import ChatOpenAI
from app.core.config import get_settings

settings = get_settings()


def get_llm(temperature: float = 0.7) -> ChatOpenAI:
    """获取 DeepSeek LLM 实例"""
    return ChatOpenAI(
        model=settings.deepseek_model,
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
        temperature=temperature,
        request_timeout=60,
        max_retries=2,
    )