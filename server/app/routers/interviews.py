"""
面试对比矩阵 API — 候选人分组、多维打分对比、HR 推荐报告
"""
import json
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import PlainTextResponse

from app.database.connection import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/interviews", tags=["interviews"])


@router.get("/candidates")
async def list_candidates(position: Optional[str] = Query(None, description="按岗位筛选")):
    """
    候选人列表 — 从面试类型录音中提取候选人信息

    自动按录音标题 / 分析中的候选人名称分组
    """
    db = await get_db()
    try:
        if position:
            cursor = await db.execute(
                "SELECT * FROM recordings WHERE scene_type = 'interview' AND title LIKE ? ORDER BY created_at DESC",
                (f"%{position}%",),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM recordings WHERE scene_type = 'interview' ORDER BY created_at DESC"
            )
        rows = [dict(r) for r in await cursor.fetchall()]

        candidates = []
        for rec in rows:
            analysis = _parse_analysis(rec.get("analysis"))
            assessment = analysis.get("candidate_assessment", {}) if analysis else {}

            # 计算总分
            scores = {}
            total = 0
            count = 0
            for dim in ["technical_skill", "communication", "logical_thinking", "culture_fit"]:
                dim_data = assessment.get(dim, {})
                score = dim_data.get("score", 0) if isinstance(dim_data, dict) else 0
                scores[dim] = score
                if score > 0:
                    total += score
                    count += 1

            avg_score = round(total / max(count, 1), 1)

            candidates.append({
                "recording_id": rec["id"],
                "name": _extract_candidate_name(rec["title"]),
                "title": rec["title"],
                "date": rec["created_at"],
                "duration": rec.get("duration", 0),
                "status": rec.get("status", ""),
                "scores": scores,
                "avg_score": avg_score,
                "recommendation": analysis.get("recommendation", "未评估") if analysis else "未评估",
                "summary": analysis.get("summary", "") if analysis else "",
                "strengths": analysis.get("strengths", []) if analysis else [],
                "weaknesses": analysis.get("weaknesses", []) if analysis else [],
            })

        # 按平均分降序排列
        candidates.sort(key=lambda x: x["avg_score"], reverse=True)

        return {
            "candidates": candidates,
            "total": len(candidates),
            "dimensions": ["technical_skill", "communication", "logical_thinking", "culture_fit"],
            "dimension_labels": {
                "technical_skill": "技术能力",
                "communication": "沟通表达",
                "logical_thinking": "逻辑思维",
                "culture_fit": "文化匹配",
            },
        }
    finally:
        await db.close()


@router.get("/compare")
async def compare_candidates(ids: str = Query(..., description="录音ID列表，逗号分隔")):
    """
    横向对比 — 多个候选人的多维度分数对比

    ids 格式: "id1,id2,id3"
    """
    recording_ids = [i.strip() for i in ids.split(",") if i.strip()]
    if len(recording_ids) < 2:
        raise HTTPException(400, "至少需要 2 个候选人进行对比")

    db = await get_db()
    try:
        placeholders = ",".join(["?"] * len(recording_ids))
        cursor = await db.execute(
            f"SELECT * FROM recordings WHERE id IN ({placeholders}) AND scene_type = 'interview'",
            recording_ids,
        )
        rows = [dict(r) for r in await cursor.fetchall()]

        if len(rows) < 2:
            raise HTTPException(404, "未找到足够的面试录音")

        comparison = []
        for rec in rows:
            analysis = _parse_analysis(rec.get("analysis"))
            assessment = analysis.get("candidate_assessment", {}) if analysis else {}

            scores = {}
            for dim in ["technical_skill", "communication", "logical_thinking", "culture_fit"]:
                dim_data = assessment.get(dim, {})
                scores[dim] = {
                    "score": dim_data.get("score", 0) if isinstance(dim_data, dict) else 0,
                    "comment": dim_data.get("comment", "") if isinstance(dim_data, dict) else "",
                }

            total = sum(s["score"] for s in scores.values())
            avg = round(total / max(len(scores), 1), 1)

            comparison.append({
                "recording_id": rec["id"],
                "name": _extract_candidate_name(rec["title"]),
                "scores": scores,
                "avg_score": avg,
                "recommendation": analysis.get("recommendation", "未评估") if analysis else "未评估",
                "strengths": analysis.get("strengths", []) if analysis else [],
                "weaknesses": analysis.get("weaknesses", []) if analysis else [],
                "summary": analysis.get("summary", "") if analysis else "",
            })

        # 按总分排名
        comparison.sort(key=lambda x: x["avg_score"], reverse=True)

        # 各维度最高分标注
        dimension_bests: dict[str, str] = {}
        for dim in ["technical_skill", "communication", "logical_thinking", "culture_fit"]:
            best = max(comparison, key=lambda c: c["scores"][dim]["score"])
            dimension_bests[dim] = best["recording_id"]

        return {
            "candidates": comparison,
            "dimension_bests": dimension_bests,
            "ranking": [c["name"] for c in comparison],
        }
    finally:
        await db.close()


@router.get("/report/{recording_id}")
async def generate_hr_report(recording_id: str):
    """
    HR 推荐报告 — 生成 Markdown 格式的候选人评估报告
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM recordings WHERE id = ? AND scene_type = 'interview'",
            (recording_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "面试录音不存在")

        rec = dict(row)
        analysis = _parse_analysis(rec.get("analysis"))
        if not analysis:
            raise HTTPException(400, "该录音尚未完成 AI 分析")

        name = _extract_candidate_name(rec["title"])
        assessment = analysis.get("candidate_assessment", {})
        date_str = rec["created_at"][:10] if rec.get("created_at") else "未知"

        # 构建 Markdown 报告
        md_lines = [
            f"# 📋 面试评估报告 — {name}",
            "",
            f"**面试日期**: {date_str}  ",
            f"**录音时长**: {_fmt_duration(rec.get('duration', 0))}  ",
            f"**录用建议**: {analysis.get('recommendation', '未评估')}",
            "",
            "---",
            "",
            "## 📊 综合评分",
            "",
            "| 维度 | 分数 | 评价 |",
            "|------|------|------|",
        ]

        dimensions = {
            "technical_skill": "技术能力",
            "communication": "沟通表达",
            "logical_thinking": "逻辑思维",
            "culture_fit": "文化匹配",
        }

        total = 0
        for key, label in dimensions.items():
            dim_data = assessment.get(key, {})
            score = dim_data.get("score", 0) if isinstance(dim_data, dict) else 0
            comment = dim_data.get("comment", "-") if isinstance(dim_data, dict) else "-"
            total += score
            bar = "█" * score + "░" * (10 - score)
            md_lines.append(f"| {label} | {bar} {score}/10 | {comment} |")

        avg = round(total / 4, 1)
        md_lines.extend([
            "",
            f"**综合得分: {avg}/10**",
            "",
            "---",
            "",
            "## ✅ 面试概况",
            "",
            analysis.get("summary", "暂无"),
            "",
        ])

        # 亮点
        strengths = analysis.get("strengths", [])
        if strengths:
            md_lines.extend(["## 💪 候选人亮点", ""])
            for s in strengths:
                md_lines.append(f"- {s}")
            md_lines.append("")

        # 不足
        weaknesses = analysis.get("weaknesses", [])
        if weaknesses:
            md_lines.extend(["## ⚠️ 待改进", ""])
            for w in weaknesses:
                md_lines.append(f"- {w}")
            md_lines.append("")

        # 关键问答
        key_qa = analysis.get("key_qa", [])
        if key_qa:
            md_lines.extend(["## 🎯 关键问答", ""])
            for qa in key_qa:
                if isinstance(qa, dict):
                    md_lines.append(f"**Q**: {qa.get('question', '')}")
                    md_lines.append(f"**评价**: {qa.get('answer_quality', '')}")
                    md_lines.append("")

        md_lines.extend([
            "---",
            f"*报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
            f"*由 AiRecord AI 自动生成*",
        ])

        return PlainTextResponse(
            content="\n".join(md_lines),
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={name}_interview_report.md"},
        )
    finally:
        await db.close()


# ===================== 辅助函数 =====================

def _extract_candidate_name(title: str) -> str:
    """从录音标题中提取候选人名称"""
    # 尝试常见格式: "面试-张三", "张三面试", "面试 张三"
    for sep in ["-", "_", " ", "—", "："]:
        if sep in title:
            parts = title.split(sep)
            # 取非"面试"的部分
            for p in parts:
                p = p.strip()
                if p and "面试" not in p and "interview" not in p.lower():
                    return p
    return title


def _parse_analysis(analysis_str: Optional[str]) -> Optional[dict]:
    """安全解析 analysis JSON"""
    if not analysis_str:
        return None
    try:
        return json.loads(analysis_str)
    except (json.JSONDecodeError, TypeError):
        return None


def _fmt_duration(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{s}秒"
    return f"{s // 60}分{s % 60}秒"
