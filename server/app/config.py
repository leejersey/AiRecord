"""
AiRecord 后端配置管理
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    """应用配置，自动从 .env 文件读取"""

    # 火山引擎 ASR
    volcano_access_key: str = ""
    volcano_secret_key: str = ""
    volcano_app_id: str = ""

    # DeepSeek LLM
    deepseek_api_key: str = ""

    # 数据库
    database_url: str = "sqlite+aiosqlite:///./airecord.db"

    # 服务器
    host: str = "0.0.0.0"
    port: int = 8000

    # 文件存储
    upload_dir: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

    model_config = {
        "env_file": os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        "env_file_encoding": "utf-8",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
