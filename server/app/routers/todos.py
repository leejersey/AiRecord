"""
待办事项 API 路由 — 闭环追踪
"""
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from app.database.connection import get_db
from app.models.recording import (
    TodoResponse, TodoListResponse, TodoUpdate, TodoStatus,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/todos", tags=["todos"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("", response_model=TodoListResponse)
async def list_todos(
    status: Optional[TodoStatus] = None,
    recording_id: Optional[str] = None,
):
    """
    列出待办事项

    - **status**: 可选筛选（pending/done/overdue）
    - **recording_id**: 可选筛选指定录音的待办
    """
    db = await get_db()
    try:
        conditions = []
        params = []

        if status:
            conditions.append("status = ?")
            params.append(status.value)
        if recording_id:
            conditions.append("recording_id = ?")
            params.append(recording_id)

        where = f" WHERE {' AND '.join(conditions)}" if conditions else ""

        # 总数
        cursor = await db.execute(f"SELECT COUNT(*) FROM todos{where}", params)
        total = (await cursor.fetchone())[0]

        # 列表
        cursor = await db.execute(
            f"SELECT * FROM todos{where} ORDER BY created_at DESC",
            params,
        )
        rows = await cursor.fetchall()

        return TodoListResponse(
            items=[TodoResponse(**dict(row)) for row in rows],
            total=total,
        )
    finally:
        await db.close()


@router.get("/{todo_id}", response_model=TodoResponse)
async def get_todo(todo_id: str):
    """获取单条待办"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="待办不存在")
        return TodoResponse(**dict(row))
    finally:
        await db.close()


@router.patch("/{todo_id}", response_model=TodoResponse)
async def update_todo(todo_id: str, update: TodoUpdate):
    """更新待办状态（手动标记完成 / 修改截止日期）"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="待办不存在")

        updates = []
        params = []
        if update.status is not None:
            updates.append("status = ?")
            params.append(update.status.value)
        if update.assignee is not None:
            updates.append("assignee = ?")
            params.append(update.assignee)
        if update.deadline is not None:
            updates.append("deadline = ?")
            params.append(update.deadline)

        if updates:
            updates.append("updated_at = ?")
            params.append(_now_iso())
            params.append(todo_id)
            await db.execute(
                f"UPDATE todos SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            await db.commit()

        cursor = await db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
        row = await cursor.fetchone()
        return TodoResponse(**dict(row))
    finally:
        await db.close()


@router.delete("/{todo_id}")
async def delete_todo(todo_id: str):
    """删除待办"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM todos WHERE id = ?", (todo_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="待办不存在")

        await db.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
        await db.commit()
        return {"message": "删除成功"}
    finally:
        await db.close()


# ===================== 内部方法（供分析服务调用） =====================

async def extract_and_save_todos(recording_id: str, scene_type: str, analysis: dict):
    """
    从 AI 分析结果中提取待办并存入数据库

    自动从 analysis.action_items 提取
    """
    action_items = analysis.get("action_items", [])
    if not action_items:
        return

    db = await get_db()
    try:
        now = _now_iso()
        for item in action_items:
            if isinstance(item, dict):
                task = item.get("task", "")
            elif isinstance(item, str):
                task = item
            else:
                continue

            if not task:
                continue

            todo_id = uuid.uuid4().hex
            assignee = item.get("assignee") if isinstance(item, dict) else None
            deadline = item.get("deadline") if isinstance(item, dict) else None

            await db.execute(
                """INSERT INTO todos (id, recording_id, task, assignee, deadline, status, source_scene, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (todo_id, recording_id, task, assignee, deadline, "pending", scene_type, now, now),
            )

        await db.commit()
        logger.info(f"从录音 [{recording_id}] 提取了 {len(action_items)} 条待办")
    except Exception as e:
        logger.error(f"保存待办失败: {e}")
    finally:
        await db.close()


async def check_overdue_todos():
    """
    检查逾期待办（可由定时任务调用）
    """
    db = await get_db()
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        await db.execute(
            """UPDATE todos SET status = 'overdue', updated_at = ?
               WHERE status = 'pending' AND deadline IS NOT NULL AND deadline < ?""",
            (_now_iso(), today),
        )
        await db.commit()
    finally:
        await db.close()
