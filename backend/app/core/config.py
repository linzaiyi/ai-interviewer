import os
from pydantic_settings import BaseSettings
from functools import lru_cache


def _fix_database_url(raw_url: str) -> str:
    """Railway 注入的 DATABASE_URL 是 postgresql://，项目使用 asyncpg 需要 postgresql+asyncpg://"""
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
    return raw_url


class Settings(BaseSettings):
    # Database (Railway 自动注入 DATABASE_URL，不需要手动设置)
    database_url: str = "postgresql+asyncpg://interviewer:interviewer_secret@localhost:5432/ai_interviewer"

    # Redis (Railway 自动注入 REDIS_URL，不需要手动设置)
    redis_url: str = "redis://localhost:6379/0"

    # DeepSeek (需要在 Railway 环境变量中设置)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    # JWT (需要在 Railway 环境变量中设置 JWT_SECRET_KEY)
    jwt_secret_key: str = "change_this_to_a_random_secret_key"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # Upload
    max_upload_size: int = 10 * 1024 * 1024  # 10MB
    upload_dir: str = "uploads"

    # App
    app_env: str = "development"
    debug: bool = True

    # FAISS
    faiss_index_dir: str = "./faiss_data"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 自动修复 Railway 的 DATABASE_URL 格式
        self.database_url = _fix_database_url(self.database_url)


@lru_cache()
def get_settings() -> Settings:
    return Settings()