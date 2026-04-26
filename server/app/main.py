"""
AiRecord 后端入口
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database.connection import init_db
from app.models.recording import HealthResponse
from app.routers import recordings, todos, stats, knowledge, interviews, shortcuts
from app.routers.todos import check_overdue_todos

# 配置日志
log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
logging.basicConfig(level=logging.INFO, format=log_format)

# 生产环境：写入日志文件
import os
if not os.environ.get("DEV_MODE"):
    from logging.handlers import RotatingFileHandler
    log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, "airecord.log"),
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(logging.Formatter(log_format))
    logging.getLogger().addHandler(file_handler)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库"""
    logger.info("🚀 AiRecord 后端启动中...")
    await init_db()
    logger.info("✅ 数据库初始化完成")
    # 启动时检查逾期待办
    await check_overdue_todos()
    logger.info("✅ 逾期待办检查完成")
    # 初始化知识库
    from app.services.knowledge_service import get_collection
    col = get_collection()
    logger.info(f"✅ 知识库就绪，文档数: {col.count()}")
    yield
    logger.info("👋 AiRecord 后端关闭")


app = FastAPI(
    title="AiRecord API",
    description="录音转文字 + AI 分析 — 你的个人 AI 录音助手",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — 允许 Expo 开发客户端
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(recordings.router)
app.include_router(todos.router)
app.include_router(stats.router)
app.include_router(knowledge.router)
app.include_router(interviews.router)
app.include_router(shortcuts.router)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check():
    return HealthResponse()


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
