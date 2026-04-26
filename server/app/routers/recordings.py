"""
录音 API 路由 — 上传、查询、删除、转写、分析
"""
import json
import uuid
import os
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse
from app.database.connection import get_db
from app.services.knowledge_service import index_recording
from app.models.recording import (
    RecordingResponse, RecordingListResponse, StatusResponse,
    RecordingUpdate, SceneType, RecordingStatus,
    Utterance, AnalysisResult,
)
from app.services.storage_service import generate_file_path, delete_file, ensure_upload_dir
from app.services.asr_service import transcribe_audio
from app.services.ai_service import analyze_transcript
from app.routers.todos import extract_and_save_todos

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recordings", tags=["recordings"])


# ===================== Helpers =====================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_response(row) -> RecordingResponse:
    """将数据库行转换为响应模型"""
    data = dict(row)
    # 解析 JSON 字段
    if data.get("utterances"):
        try:
            data["utterances"] = json.loads(data["utterances"])
        except (json.JSONDecodeError, TypeError):
            data["utterances"] = None
    if data.get("analysis"):
        try:
            data["analysis"] = json.loads(data["analysis"])
        except (json.JSONDecodeError, TypeError):
            data["analysis"] = None
    return RecordingResponse(**data)


# ===================== 后台任务 =====================

async def _background_transcribe(recording_id: str):
    """后台执行 ASR 转写"""
    db = await get_db()
    try:
        # 获取录音记录
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            return

        # 更新状态为转写中
        await db.execute(
            "UPDATE recordings SET status = ?, updated_at = ? WHERE id = ?",
            (RecordingStatus.transcribing.value, _now_iso(), recording_id),
        )
        await db.commit()

        # 调用 ASR
        result = await transcribe_audio(dict(row)["audio_path"])

        # 保存结果
        await db.execute(
            """UPDATE recordings 
               SET transcript = ?, utterances = ?, status = ?, updated_at = ? 
               WHERE id = ?""",
            (
                result["transcript"],
                json.dumps(result["utterances"], ensure_ascii=False),
                RecordingStatus.transcribed.value,
                _now_iso(),
                recording_id,
            ),
        )
        await db.commit()
        logger.info(f"转写完成: {recording_id}")

    except Exception as e:
        logger.error(f"转写失败 [{recording_id}]: {str(e)}")
        await db.execute(
            "UPDATE recordings SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
            (RecordingStatus.failed.value, str(e), _now_iso(), recording_id),
        )
        await db.commit()
    finally:
        await db.close()


async def _background_analyze(recording_id: str):
    """后台执行 AI 分析（含待办闭环判断）"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            return

        row_dict = dict(row)
        transcript = row_dict.get("transcript", "")
        scene_type = row_dict.get("scene_type", "general")
        title = row_dict.get("title", "未命名录音")

        if not transcript:
            raise RuntimeError("转录文本为空，无法分析")

        # 更新状态
        await db.execute(
            "UPDATE recordings SET status = ?, updated_at = ? WHERE id = ?",
            (RecordingStatus.analyzing.value, _now_iso(), recording_id),
        )
        await db.commit()

        # 获取所有未完成待办（用于闭环判断）
        cursor = await db.execute(
            "SELECT id, task FROM todos WHERE status = 'pending'"
        )
        pending_rows = await cursor.fetchall()
        pending_todos = [{"id": dict(r)["id"], "task": dict(r)["task"]} for r in pending_rows]

        # 调用 AI（如果有未完成待办就带上闭环逻辑）
        if pending_todos:
            from app.services.ai_service import analyze_with_pending_todos
            analysis = await analyze_with_pending_todos(transcript, scene_type, pending_todos)
        else:
            analysis = await analyze_transcript(transcript, scene_type)

        # 保存分析结果
        await db.execute(
            """UPDATE recordings 
               SET analysis = ?, status = ?, updated_at = ? 
               WHERE id = ?""",
            (
                json.dumps(analysis, ensure_ascii=False),
                RecordingStatus.done.value,
                _now_iso(),
                recording_id,
            ),
        )
        await db.commit()
        logger.info(f"分析完成: {recording_id}")

        # 自动提取新待办事项
        await extract_and_save_todos(recording_id, scene_type, analysis)

        # 自动标记已完成的旧待办
        resolved_ids = analysis.get("resolved_todo_ids", [])
        if resolved_ids:
            now = _now_iso()
            for todo_id in resolved_ids:
                await db.execute(
                    "UPDATE todos SET status = 'done', resolved_by = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
                    (recording_id, now, todo_id),
                )
            await db.commit()
            logger.info(f"自动闭环 {len(resolved_ids)} 条待办")

        # 自动索引到知识库
        try:
            await index_recording(
                recording_id=recording_id,
                title=title,
                transcript=transcript,
                analysis=analysis,
                scene_type=scene_type,
            )
            logger.info(f"知识库索引完成: {recording_id}")
        except Exception as idx_err:
            logger.warning(f"知识库索引失败 [{recording_id}]: {idx_err}")

    except Exception as e:
        logger.error(f"分析失败 [{recording_id}]: {str(e)}")
        await db.execute(
            "UPDATE recordings SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
            (RecordingStatus.failed.value, str(e), _now_iso(), recording_id),
        )
        await db.commit()
    finally:
        await db.close()


# ===================== API 路由 =====================

@router.get("/search", response_model=RecordingListResponse)
async def search_recordings(q: str, page: int = 1, page_size: int = 20):
    """
    全文搜索录音（标题 + 转录文本）

    使用 SQLite FTS5 进行高效中文全文搜索。
    - **q**: 搜索关键词
    """
    db = await get_db()
    try:
        # FTS5 搜索
        cursor = await db.execute(
            """SELECT r.* FROM recordings r
               JOIN recordings_fts fts ON r.rowid = fts.rowid
               WHERE recordings_fts MATCH ?
               ORDER BY rank
               LIMIT ? OFFSET ?""",
            (q, page_size, (page - 1) * page_size),
        )
        rows = await cursor.fetchall()

        # 总数
        cursor = await db.execute(
            """SELECT COUNT(*) FROM recordings r
               JOIN recordings_fts fts ON r.rowid = fts.rowid
               WHERE recordings_fts MATCH ?""",
            (q,),
        )
        total = (await cursor.fetchone())[0]

        return RecordingListResponse(
            items=[_row_to_response(row) for row in rows],
            total=total,
        )
    except Exception as e:
        # FTS 搜索失败时回退到 LIKE 搜索
        logger.warning(f"FTS 搜索失败，回退到 LIKE: {e}")
        cursor = await db.execute(
            """SELECT * FROM recordings
               WHERE title LIKE ? OR transcript LIKE ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            (f"%{q}%", f"%{q}%", page_size, (page - 1) * page_size),
        )
        rows = await cursor.fetchall()
        cursor = await db.execute(
            "SELECT COUNT(*) FROM recordings WHERE title LIKE ? OR transcript LIKE ?",
            (f"%{q}%", f"%{q}%"),
        )
        total = (await cursor.fetchone())[0]
        return RecordingListResponse(
            items=[_row_to_response(row) for row in rows],
            total=total,
        )
    finally:
        await db.close()


@router.post("/upload", response_model=RecordingResponse)
async def upload_recording(
    file: UploadFile = File(...),
    scene_type: SceneType = Form(SceneType.general),
    title: Optional[str] = Form(None),
):
    """
    上传音频文件

    - **file**: 音频文件 (m4a, wav, mp3 等)
    - **scene_type**: 场景类型 (meeting/interview/idea/general)
    - **title**: 可选标题
    """
    ensure_upload_dir()

    # 生成文件路径
    file_path, audio_format = generate_file_path(file.filename or "recording.m4a")

    # 保存文件
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # 生成记录
    recording_id = uuid.uuid4().hex
    now = _now_iso()
    recording_title = title or f"录音_{datetime.now().strftime('%m%d_%H%M')}"

    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO recordings 
               (id, title, audio_path, audio_format, duration, file_size, scene_type, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                recording_id,
                recording_title,
                file_path,
                audio_format,
                0.0,  # TODO: 用 pydub 提取时长
                len(content),
                scene_type.value,
                RecordingStatus.uploaded.value,
                now,
                now,
            ),
        )
        await db.commit()

        # 返回新建记录
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        return _row_to_response(row)
    finally:
        await db.close()


@router.get("", response_model=RecordingListResponse)
async def list_recordings(
    scene_type: Optional[SceneType] = None,
    page: int = 1,
    page_size: int = 20,
):
    """列出录音记录（分页 + 可选场景筛选）"""
    db = await get_db()
    try:
        base_query = "FROM recordings"
        params = []

        if scene_type:
            base_query += " WHERE scene_type = ?"
            params.append(scene_type.value)

        # 总数
        cursor = await db.execute(f"SELECT COUNT(*) {base_query}", params)
        total = (await cursor.fetchone())[0]

        # 分页
        offset = (page - 1) * page_size
        cursor = await db.execute(
            f"SELECT * {base_query} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [page_size, offset],
        )
        rows = await cursor.fetchall()

        return RecordingListResponse(
            items=[_row_to_response(row) for row in rows],
            total=total,
        )
    finally:
        await db.close()


@router.get("/{recording_id}", response_model=RecordingResponse)
async def get_recording(recording_id: str):
    """获取录音详情"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")
        return _row_to_response(row)
    finally:
        await db.close()


@router.delete("/{recording_id}")
async def delete_recording(recording_id: str):
    """删除录音记录（含音频文件）"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT audio_path FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        # 删除文件
        delete_file(dict(row)["audio_path"])

        # 删除数据库记录
        await db.execute("DELETE FROM recordings WHERE id = ?", (recording_id,))
        await db.commit()

        return {"message": "删除成功"}
    finally:
        await db.close()


@router.patch("/{recording_id}", response_model=RecordingResponse)
async def update_recording(recording_id: str, update: RecordingUpdate):
    """更新录音信息（标题、场景类型）"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        updates = []
        params = []
        if update.title is not None:
            updates.append("title = ?")
            params.append(update.title)
        if update.scene_type is not None:
            updates.append("scene_type = ?")
            params.append(update.scene_type.value)

        if updates:
            updates.append("updated_at = ?")
            params.append(_now_iso())
            params.append(recording_id)
            await db.execute(
                f"UPDATE recordings SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            await db.commit()

        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        return _row_to_response(row)
    finally:
        await db.close()


@router.get("/{recording_id}/status", response_model=StatusResponse)
async def get_status(recording_id: str):
    """查询处理状态（前端轮询用）"""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, status, error_message FROM recordings WHERE id = ?",
            (recording_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")
        return StatusResponse(**dict(row))
    finally:
        await db.close()


@router.post("/{recording_id}/transcribe", response_model=StatusResponse)
async def start_transcribe(recording_id: str, background_tasks: BackgroundTasks):
    """触发 ASR 转写（异步后台任务）"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        row_dict = dict(row)
        # 仅在「正在转写中」时禁止重复触发
        if row_dict["status"] == RecordingStatus.transcribing.value:
            raise HTTPException(status_code=400, detail="转写正在进行中，请稍候")

        background_tasks.add_task(_background_transcribe, recording_id)

        return StatusResponse(id=recording_id, status=RecordingStatus.transcribing)
    finally:
        await db.close()


@router.post("/{recording_id}/analyze", response_model=StatusResponse)
async def start_analyze(recording_id: str, background_tasks: BackgroundTasks):
    """触发 AI 分析（异步后台任务）"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        row_dict = dict(row)
        if row_dict["status"] not in (
            RecordingStatus.transcribed.value,
            RecordingStatus.failed.value,
        ):
            raise HTTPException(
                status_code=400,
                detail=f"当前状态 [{row_dict['status']}] 不允许分析，需先完成转写",
            )

        background_tasks.add_task(_background_analyze, recording_id)

        return StatusResponse(id=recording_id, status=RecordingStatus.analyzing)
    finally:
        await db.close()


@router.get("/{recording_id}/audio")
async def stream_audio(recording_id: str):
    """流式返回音频文件（供前端播放器使用）"""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT audio_path, audio_format FROM recordings WHERE id = ?",
            (recording_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        row_dict = dict(row)
        audio_path = row_dict["audio_path"]

        if not os.path.exists(audio_path):
            raise HTTPException(status_code=404, detail="音频文件不存在")

        mime_map = {
            "m4a": "audio/mp4",
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "aac": "audio/aac",
            "ogg": "audio/ogg",
            "flac": "audio/flac",
        }
        mime = mime_map.get(row_dict["audio_format"], "audio/mpeg")

        def iterfile():
            with open(audio_path, "rb") as f:
                while chunk := f.read(1024 * 64):
                    yield chunk

        return StreamingResponse(iterfile(), media_type=mime)
    finally:
        await db.close()


@router.get("/{recording_id}/export")
async def export_markdown(recording_id: str):
    """导出 Markdown 格式的分析报告"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        data = dict(row)
        scene_labels = {
            "meeting": "会议记录",
            "interview": "面试分析",
            "idea": "灵感捕捉",
            "general": "通用",
        }

        lines = []
        lines.append(f"# {data['title']}")
        lines.append("")
        lines.append(f"**场景**: {scene_labels.get(data['scene_type'], '通用')}")
        lines.append(f"**日期**: {data['created_at'][:10]}")
        lines.append(f"**时长**: {int(data['duration'])} 秒")
        lines.append("")

        # 转录文本
        if data.get("transcript"):
            lines.append("## 📝 转录文本")
            lines.append("")
            lines.append(data["transcript"])
            lines.append("")

        # AI 分析
        analysis = None
        if data.get("analysis"):
            try:
                analysis = json.loads(data["analysis"])
            except (json.JSONDecodeError, TypeError):
                pass

        if analysis:
            lines.append("## 🤖 AI 分析")
            lines.append("")

            if analysis.get("summary"):
                lines.append("### 摘要")
                lines.append(f"> {analysis['summary']}")
                lines.append("")

            if analysis.get("key_points"):
                lines.append("### 关键要点")
                for point in analysis["key_points"]:
                    lines.append(f"- ✅ {point}")
                lines.append("")

            if analysis.get("action_items"):
                lines.append("### 待办事项")
                for item in analysis["action_items"]:
                    task = item.get("task", "")
                    assignee = item.get("assignee", "")
                    deadline = item.get("deadline", "")
                    meta = ""
                    if assignee:
                        meta += f" | 负责人: {assignee}"
                    if deadline:
                        meta += f" | 截止: {deadline}"
                    lines.append(f"- [ ] {task}{meta}")
                lines.append("")

            if analysis.get("topics"):
                lines.append("### 话题标签")
                tags = " ".join([f"`{t}`" for t in analysis["topics"]])
                lines.append(tags)
                lines.append("")

            if analysis.get("sentiment"):
                lines.append(f"### 情感倾向\n{analysis['sentiment']}")
                lines.append("")

            if analysis.get("follow_up_questions"):
                lines.append("### 待跟进问题")
                for q in analysis["follow_up_questions"]:
                    lines.append(f"- ❓ {q}")
                lines.append("")

        lines.append("---")
        lines.append("*由 AiRecord 自动生成*")

        md_content = "\n".join(lines)
        # URL-encode 中文文件名以避免 latin-1 编码错误
        from urllib.parse import quote
        encoded_name = quote(f"{data['title']}.md")
        return PlainTextResponse(
            content=md_content,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"
            },
        )
    finally:
        await db.close()
