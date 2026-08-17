from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://interviewer:interviewer_secret@localhost:5432/ai_interviewer"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # DeepSeek
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    # JWT
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


@lru_cache()
def get_settings() -> Settings:
    return Settings()