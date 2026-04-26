"""
数据统计 & 报告 API — 仪表盘 + 周报
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter
from app.database.connection import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/dashboard")
async def get_dashboard():
    """
    仪表盘统计数据

    返回: 录音总数、总时长、各场景分布、待办统计、本周活跃度
    """
    db = await get_db()
    try:
        # 录音总数 & 总时长
        cursor = await db.execute(
            "SELECT COUNT(*) as total, COALESCE(SUM(duration), 0) as total_duration FROM recordings"
        )
        row = await cursor.fetchone()
        total_recordings = dict(row)["total"]
        total_duration = dict(row)["total_duration"]

        # 各场景分布
        cursor = await db.execute(
            "SELECT scene_type, COUNT(*) as count FROM recordings GROUP BY scene_type"
        )
        scene_distribution = {dict(r)["scene_type"]: dict(r)["count"] for r in await cursor.fetchall()}

        # 状态分布
        cursor = await db.execute(
            "SELECT status, COUNT(*) as count FROM recordings GROUP BY status"
        )
        status_distribution = {dict(r)["status"]: dict(r)["count"] for r in await cursor.fetchall()}

        # 待办统计
        cursor = await db.execute(
            "SELECT status, COUNT(*) as count FROM todos GROUP BY status"
        )
        todo_stats = {dict(r)["status"]: dict(r)["count"] for r in await cursor.fetchall()}

        # 本周录音（最近7天每天数量）
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        cursor = await db.execute(
            """SELECT DATE(created_at) as day, COUNT(*) as count 
               FROM recordings WHERE created_at >= ? 
               GROUP BY DATE(created_at) ORDER BY day""",
            (week_ago,),
        )
        weekly_activity = [
            {"day": dict(r)["day"], "count": dict(r)["count"]}
            for r in await cursor.fetchall()
        ]

        # AI 分析完成率
        cursor = await db.execute(
            "SELECT COUNT(*) FROM recordings WHERE status = 'done'"
        )
        done_count = (await cursor.fetchone())[0]

        return {
            "total_recordings": total_recordings,
            "total_duration_seconds": total_duration,
            "total_duration_formatted": _format_duration(total_duration),
            "analysis_completion_rate": round(done_count / max(total_recordings, 1) * 100, 1),
            "scene_distribution": scene_distribution,
            "status_distribution": status_distribution,
            "todo_stats": todo_stats,
            "weekly_activity": weekly_activity,
        }
    finally:
        await db.close()


@router.get("/weekly-report")
async def generate_weekly_report():
    """
    生成本周周报

    自动汇总：本周录音数、新待办、已完成待办、高频话题
    """
    db = await get_db()
    try:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        # 本周录音
        cursor = await db.execute(
            "SELECT * FROM recordings WHERE created_at >= ? ORDER BY created_at DESC",
            (week_ago,),
        )
        recordings = [dict(r) for r in await cursor.fetchall()]

        # 本周新增待办
        cursor = await db.execute(
            "SELECT COUNT(*) FROM todos WHERE created_at >= ?", (week_ago,)
        )
        new_todos = (await cursor.fetchone())[0]

        # 本周完成待办
        cursor = await db.execute(
            "SELECT COUNT(*) FROM todos WHERE status = 'done' AND updated_at >= ?",
            (week_ago,),
        )
        completed_todos = (await cursor.fetchone())[0]

        # 提取高频话题
        all_topics = []
        for rec in recordings:
            if rec.get("analysis"):
                try:
                    analysis = json.loads(rec["analysis"])
                    all_topics.extend(analysis.get("topics", []))
                except (json.JSONDecodeError, TypeError):
                    pass

        # 统计话题频率
        topic_counts: dict[str, int] = {}
        for t in all_topics:
            topic_counts[t] = topic_counts.get(t, 0) + 1
        top_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:10]

        # 总时长
        total_duration = sum(r.get("duration", 0) for r in recordings)

        # 场景分布
        scene_counts: dict[str, int] = {}
        for r in recordings:
            st = r.get("scene_type", "general")
            scene_counts[st] = scene_counts.get(st, 0) + 1

        return {
            "period": f"{(datetime.now() - timedelta(days=7)).strftime('%m/%d')} - {datetime.now().strftime('%m/%d')}",
            "total_recordings": len(recordings),
            "total_duration_formatted": _format_duration(total_duration),
            "scene_distribution": scene_counts,
            "new_todos": new_todos,
            "completed_todos": completed_todos,
            "top_topics": [{"topic": t, "count": c} for t, c in top_topics],
            "highlight_recordings": [
                {"id": r["id"], "title": r["title"], "scene_type": r["scene_type"]}
                for r in recordings[:5]
            ],
        }
    finally:
        await db.close()


@router.get("/zombie-topics")
async def detect_zombie_topics():
    """
    僵尸议题检测 — 找出反复出现但未推进的话题

    策略:
    1. 统计所有录音中的待办事项，找到长期 pending 的
    2. 统计跨录音重复出现的话题
    3. 标记超过 7 天未闭环的待办为"僵尸议题"
    """
    db = await get_db()
    try:
        # 1. 长期挂起的待办（超过 7 天）
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        cursor = await db.execute(
            """SELECT t.id, t.task, t.assignee, t.created_at, r.title as recording_title
               FROM todos t
               LEFT JOIN recordings r ON t.recording_id = r.id
               WHERE t.status = 'pending' AND t.created_at < ?
               ORDER BY t.created_at ASC""",
            (week_ago,),
        )
        stale_todos = [dict(r) for r in await cursor.fetchall()]

        # 2. 跨录音重复话题
        cursor = await db.execute(
            "SELECT analysis FROM recordings WHERE status = 'done' AND analysis IS NOT NULL"
        )
        all_topics: dict[str, list[str]] = {}  # topic -> [recording_titles]
        for row in await cursor.fetchall():
            try:
                analysis = json.loads(dict(row)["analysis"])
                topics = analysis.get("topics", [])
                title = analysis.get("summary", "")[:30]
                for t in topics:
                    if t not in all_topics:
                        all_topics[t] = []
                    all_topics[t].append(title)
            except (json.JSONDecodeError, TypeError):
                pass

        # 出现 >= 3 次的话题视为反复出现
        recurring_topics = [
            {"topic": topic, "occurrences": len(recordings), "in_recordings": recordings[:5]}
            for topic, recordings in sorted(all_topics.items(), key=lambda x: len(x[1]), reverse=True)
            if len(recordings) >= 2
        ]

        # 3. 过期待办（有 deadline 且已过期）
        cursor = await db.execute(
            """SELECT t.id, t.task, t.deadline, r.title as recording_title
               FROM todos t
               LEFT JOIN recordings r ON t.recording_id = r.id
               WHERE t.status = 'pending' AND t.deadline IS NOT NULL AND t.deadline < ?
               ORDER BY t.deadline ASC""",
            (datetime.now(timezone.utc).isoformat(),),
        )
        overdue_todos = [dict(r) for r in await cursor.fetchall()]

        return {
            "stale_todos": stale_todos[:20],
            "stale_count": len(stale_todos),
            "recurring_topics": recurring_topics[:15],
            "overdue_todos": overdue_todos[:20],
            "overdue_count": len(overdue_todos),
            "health_score": _calc_health_score(len(stale_todos), len(overdue_todos), len(recurring_topics)),
        }
    finally:
        await db.close()


def _calc_health_score(stale: int, overdue: int, recurring: int) -> dict:
    """计算待办健康度评分"""
    score = 100
    score -= min(stale * 5, 30)      # 每个僵尸待办扣 5 分
    score -= min(overdue * 10, 40)    # 每个过期待办扣 10 分
    score -= min(recurring * 3, 20)   # 每个重复话题扣 3 分
    score = max(score, 0)

    level = "🟢 健康" if score >= 80 else "🟡 需关注" if score >= 50 else "🔴 需要立即处理"
    return {"score": score, "level": level}


def _format_duration(seconds: float) -> str:
    """格式化时长为人类可读"""
    s = int(seconds)
    if s < 60:
        return f"{s}秒"
    elif s < 3600:
        return f"{s // 60}分{s % 60}秒"
    else:
        h = s // 3600
        m = (s % 3600) // 60
        return f"{h}小时{m}分"

