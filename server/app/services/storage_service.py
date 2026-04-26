"""
文件存储服务 — 管理音频文件上传和删除
"""
import os
import uuid
from app.config import get_settings


def ensure_upload_dir():
    """确保上传目录存在"""
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)


def generate_file_path(original_filename: str) -> tuple[str, str]:
    """
    生成唯一文件路径

    Returns:
        (file_path, audio_format)
    """
    settings = get_settings()
    ext = os.path.splitext(original_filename)[1].lower() or ".m4a"
    audio_format = ext.lstrip(".")
    file_id = uuid.uuid4().hex
    filename = f"{file_id}{ext}"
    file_path = os.path.join(settings.upload_dir, filename)
    return file_path, audio_format


def delete_file(file_path: str):
    """删除文件（忽略不存在的情况）"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError:
        pass
