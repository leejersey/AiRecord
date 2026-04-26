"""
SQLite 数据库连接与表初始化
"""
import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "airecord.db")

CREATE_RECORDINGS_TABLE = """
CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '未命名录音',
    audio_path TEXT NOT NULL,
    audio_format TEXT NOT NULL DEFAULT 'unknown',
    duration REAL NOT NULL DEFAULT 0.0,
    file_size INTEGER NOT NULL DEFAULT 0,
    transcript TEXT,
    utterances TEXT,
    analysis TEXT,
    scene_type TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'uploaded',
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

CREATE_TODOS_TABLE = """
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL,
    task TEXT NOT NULL,
    assignee TEXT,
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by TEXT,
    source_scene TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);
"""

# FTS5 全文搜索虚拟表
CREATE_FTS_TABLE = """
CREATE VIRTUAL TABLE IF NOT EXISTS recordings_fts USING fts5(
    title,
    transcript,
    content='recordings',
    content_rowid='rowid'
);
"""

# 同步触发器（录音新增/更新/删除时自动维护 FTS 索引）
FTS_TRIGGERS = [
    """CREATE TRIGGER IF NOT EXISTS recordings_ai AFTER INSERT ON recordings BEGIN
        INSERT INTO recordings_fts(rowid, title, transcript) VALUES (new.rowid, new.title, new.transcript);
    END;""",
    """CREATE TRIGGER IF NOT EXISTS recordings_ad AFTER DELETE ON recordings BEGIN
        INSERT INTO recordings_fts(recordings_fts, rowid, title, transcript) VALUES ('delete', old.rowid, old.title, old.transcript);
    END;""",
    """CREATE TRIGGER IF NOT EXISTS recordings_au AFTER UPDATE ON recordings BEGIN
        INSERT INTO recordings_fts(recordings_fts, rowid, title, transcript) VALUES ('delete', old.rowid, old.title, old.transcript);
        INSERT INTO recordings_fts(rowid, title, transcript) VALUES (new.rowid, new.title, new.transcript);
    END;""",
]


async def get_db() -> aiosqlite.Connection:
    """获取数据库连接"""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    return db


async def init_db():
    """初始化数据库表"""
    db = await get_db()
    try:
        await db.execute(CREATE_RECORDINGS_TABLE)
        await db.execute(CREATE_TODOS_TABLE)
        await db.execute(CREATE_FTS_TABLE)
        for trigger in FTS_TRIGGERS:
            await db.execute(trigger)
        await db.commit()
    finally:
        await db.close()
