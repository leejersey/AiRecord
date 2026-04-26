"""
知识库 API — 对话式查询 + 跨录音关联
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Query

from app.database.connection import get_db
from app.services.knowledge_service import (
    search_knowledge,
    find_related_recordings,
    get_knowledge_stats,
    index_recording,
)
from app.services.ai_service import analyze_with_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("/query")
async def query_knowledge(body: dict):
    """
    对话式知识库查询

    接收自然语言问题，通过 RAG 检索相关上下文后交给 AI 回答。
    body: { "question": "上次会议讨论了什么？", "scene_type": "meeting" (可选) }
    """
    question = body.get("question", "").strip()
    scene_filter = body.get("scene_type")

    if not question:
        return {"answer": "请输入您的问题", "sources": []}

    # Step 1: 语义检索
    results = await search_knowledge(question, n_results=8, scene_filter=scene_filter)

    if not results:
        return {
            "answer": "知识库中暂无相关信息。请先录制并分析一些录音。",
            "sources": [],
        }

    # Step 2: 构建上下文
    context_parts = []
    sources = []
    seen_recordings = set()

    for item in results:
        rid = item["recording_id"]
        context_parts.append(
            f"[来源: {item['title']}] ({item['chunk_type']})\n{item['document']}"
        )
        if rid not in seen_recordings:
            seen_recordings.add(rid)
            sources.append({
                "recording_id": rid,
                "title": item["title"],
                "scene_type": item["scene_type"],
                "relevance_score": item["relevance_score"],
            })

    context = "\n---\n".join(context_parts)

    # Step 3: AI 回答
    answer = await analyze_with_context(question, context)

    return {
        "answer": answer,
        "sources": sources[:5],  # 最多返回 5 个来源
    }


@router.get("/search")
async def semantic_search(
    q: str = Query(..., description="搜索关键词"),
    n: int = Query(10, description="返回数量"),
    scene_type: Optional[str] = Query(None, description="场景过滤"),
):
    """
    语义搜索 — 比 FTS 更智能的搜索

    返回与查询语义最相近的录音片段
    """
    results = await search_knowledge(q, n_results=n, scene_filter=scene_type)
    return {"items": results, "total": len(results)}


@router.get("/related/{recording_id}")
async def get_related(recording_id: str, n: int = Query(5)):
    """
    跨录音关联 — 找到与指定录音最相关的其他录音
    """
    related = await find_related_recordings(recording_id, n_results=n)
    return {"items": related, "total": len(related)}


@router.post("/reindex")
async def reindex_all():
    """
    重建全部索引 — 将所有已分析的录音重新索引到知识库

    适用场景: 首次部署或数据修复
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, title, transcript, analysis, scene_type FROM recordings WHERE status = 'done'"
        )
        recordings = [dict(r) for r in await cursor.fetchall()]

        count = 0
        for rec in recordings:
            analysis = None
            if rec.get("analysis"):
                try:
                    analysis = json.loads(rec["analysis"])
                except (json.JSONDecodeError, TypeError):
                    pass

            await index_recording(
                recording_id=rec["id"],
                title=rec["title"],
                transcript=rec.get("transcript", ""),
                analysis=analysis,
                scene_type=rec.get("scene_type", "general"),
            )
            count += 1

        return {"message": f"重建索引完成，共索引 {count} 条录音", "count": count}
    finally:
        await db.close()


@router.get("/stats")
async def knowledge_base_stats():
    """获取知识库统计信息"""
    stats = get_knowledge_stats()
    return stats


@router.get("/graph")
async def get_knowledge_graph():
    """
    知识图谱数据 — 话题/人物网络关系

    返回节点(topics, people) + 边(共现关系) 用于可视化
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, title, analysis, scene_type FROM recordings WHERE status = 'done' AND analysis IS NOT NULL"
        )
        rows = [dict(r) for r in await cursor.fetchall()]

        # 提取节点和边
        topic_counts: dict[str, int] = {}
        topic_scenes: dict[str, set] = {}
        edges: dict[tuple[str, str], int] = {}

        for rec in rows:
            try:
                analysis = json.loads(rec["analysis"])
            except (json.JSONDecodeError, TypeError):
                continue

            topics = analysis.get("topics", [])

            # 统计每个话题出现次数
            for t in topics:
                topic_counts[t] = topic_counts.get(t, 0) + 1
                if t not in topic_scenes:
                    topic_scenes[t] = set()
                topic_scenes[t].add(rec["scene_type"])

            # 共现边（同一录音中出现的话题互相关联）
            for i in range(len(topics)):
                for j in range(i + 1, len(topics)):
                    a, b = tuple(sorted([topics[i], topics[j]]))
                    edges[(a, b)] = edges.get((a, b), 0) + 1

        # 构建节点列表（按出现次数排序）
        nodes = [
            {
                "id": topic,
                "label": topic,
                "size": count,
                "type": "topic",
                "scenes": list(topic_scenes.get(topic, set())),
            }
            for topic, count in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:50]
        ]

        # 构建边列表
        edge_list = [
            {"source": a, "target": b, "weight": w}
            for (a, b), w in sorted(edges.items(), key=lambda x: x[1], reverse=True)[:100]
        ]

        return {
            "nodes": nodes,
            "edges": edge_list,
            "total_topics": len(topic_counts),
            "total_recordings": len(rows),
        }
    finally:
        await db.close()
