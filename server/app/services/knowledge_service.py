"""
RAG 知识库服务 — 基于 ChromaDB 的本地向量检索

功能:
1. 录音转录 + 分析结果向量化入库
2. 语义搜索（自然语言查询最相关的录音片段）
3. 跨录音关联识别
"""
import json
import logging
import os
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

logger = logging.getLogger(__name__)

# ChromaDB 存储路径
CHROMA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_data")

# 全局客户端（懒加载）
_client: Optional[chromadb.ClientAPI] = None
_collection: Optional[chromadb.Collection] = None


def get_chroma_client() -> chromadb.ClientAPI:
    """获取 ChromaDB 客户端（单例）"""
    global _client
    if _client is None:
        os.makedirs(CHROMA_DIR, exist_ok=True)
        _client = chromadb.PersistentClient(path=CHROMA_DIR)
        logger.info(f"ChromaDB 初始化完成: {CHROMA_DIR}")
    return _client


def get_collection() -> chromadb.Collection:
    """获取录音知识库 collection"""
    global _collection
    if _collection is None:
        client = get_chroma_client()
        _collection = client.get_or_create_collection(
            name="recordings_knowledge",
            metadata={"description": "AiRecord 录音知识库"},
        )
        logger.info(f"Collection 'recordings_knowledge' 就绪，文档数: {_collection.count()}")
    return _collection


async def index_recording(recording_id: str, title: str, transcript: str,
                           analysis: Optional[dict], scene_type: str):
    """
    将一条录音索引到知识库

    策略: 将长文本分块（chunk），每块独立入库
    """
    collection = get_collection()

    # 删除该录音的旧文档（支持重新索引）
    try:
        existing = collection.get(where={"recording_id": recording_id})
        if existing and existing["ids"]:
            collection.delete(ids=existing["ids"])
    except Exception:
        pass

    chunks = []
    metadatas = []
    ids = []

    # Chunk 1: 转录全文（分段，每段 ~500 字）
    if transcript:
        segments = _split_text(transcript, max_len=500)
        for i, seg in enumerate(segments):
            chunk_id = f"{recording_id}_transcript_{i}"
            chunks.append(seg)
            metadatas.append({
                "recording_id": recording_id,
                "title": title,
                "scene_type": scene_type,
                "chunk_type": "transcript",
                "chunk_index": i,
            })
            ids.append(chunk_id)

    # Chunk 2: 分析摘要
    if analysis:
        summary = analysis.get("summary", "")
        if summary:
            chunks.append(f"[摘要] {summary}")
            metadatas.append({
                "recording_id": recording_id,
                "title": title,
                "scene_type": scene_type,
                "chunk_type": "summary",
                "chunk_index": 0,
            })
            ids.append(f"{recording_id}_summary")

        # Chunk 3: 关键要点
        key_points = analysis.get("key_points", [])
        if key_points:
            points_text = "[关键要点] " + " | ".join(key_points)
            chunks.append(points_text)
            metadatas.append({
                "recording_id": recording_id,
                "title": title,
                "scene_type": scene_type,
                "chunk_type": "key_points",
                "chunk_index": 0,
            })
            ids.append(f"{recording_id}_keypoints")

        # Chunk 4: 话题
        topics = analysis.get("topics", [])
        if topics:
            topics_text = "[讨论话题] " + " | ".join(topics)
            chunks.append(topics_text)
            metadatas.append({
                "recording_id": recording_id,
                "title": title,
                "scene_type": scene_type,
                "chunk_type": "topics",
                "chunk_index": 0,
            })
            ids.append(f"{recording_id}_topics")

        # Chunk 5: 待办事项
        action_items = analysis.get("action_items", [])
        if action_items:
            items_text = "[待办事项] " + " | ".join(
                [item.get("task", str(item)) if isinstance(item, dict) else str(item)
                 for item in action_items]
            )
            chunks.append(items_text)
            metadatas.append({
                "recording_id": recording_id,
                "title": title,
                "scene_type": scene_type,
                "chunk_type": "action_items",
                "chunk_index": 0,
            })
            ids.append(f"{recording_id}_actions")

    if not chunks:
        logger.warning(f"录音 [{recording_id}] 无可索引内容")
        return

    # 批量入库
    collection.add(
        documents=chunks,
        metadatas=metadatas,
        ids=ids,
    )
    logger.info(f"录音 [{recording_id}] 索引完成，共 {len(chunks)} 个 chunk")


async def search_knowledge(query: str, n_results: int = 10,
                            scene_filter: Optional[str] = None) -> list[dict]:
    """
    语义搜索知识库

    Args:
        query: 自然语言查询
        n_results: 返回结果数
        scene_filter: 可选场景过滤

    Returns:
        匹配结果列表
    """
    collection = get_collection()

    if collection.count() == 0:
        return []

    where = {"scene_type": scene_filter} if scene_filter else None

    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, collection.count()),
        where=where,
    )

    items = []
    if results and results["documents"]:
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
            distance = results["distances"][0][i] if results["distances"] else 0
            items.append({
                "document": doc,
                "recording_id": meta.get("recording_id", ""),
                "title": meta.get("title", ""),
                "scene_type": meta.get("scene_type", ""),
                "chunk_type": meta.get("chunk_type", ""),
                "relevance_score": round(1 - distance, 4),  # 相似度
            })

    return items


async def find_related_recordings(recording_id: str, n_results: int = 5) -> list[dict]:
    """
    跨录音关联识别 — 找到与指定录音最相关的其他录音

    策略: 用该录音的摘要作为查询，排除自身
    """
    collection = get_collection()

    # 获取该录音的摘要 chunk
    try:
        result = collection.get(
            ids=[f"{recording_id}_summary"],
            include=["documents"],
        )
        if not result or not result["documents"]:
            return []
        query_text = result["documents"][0]
    except Exception:
        return []

    # 搜索相关内容（多取一些，后面去重）
    search_results = await search_knowledge(query_text, n_results=n_results * 3)

    # 去重（同一录音只保留最高分）+ 排除自身
    seen: dict[str, dict] = {}
    for item in search_results:
        rid = item["recording_id"]
        if rid == recording_id:
            continue
        if rid not in seen or item["relevance_score"] > seen[rid]["relevance_score"]:
            seen[rid] = item

    related = sorted(seen.values(), key=lambda x: x["relevance_score"], reverse=True)
    return related[:n_results]


def get_knowledge_stats() -> dict:
    """获取知识库统计信息"""
    collection = get_collection()
    total_docs = collection.count()

    return {
        "total_documents": total_docs,
        "storage_path": CHROMA_DIR,
    }


def _split_text(text: str, max_len: int = 500) -> list[str]:
    """将长文本按句子边界分块"""
    if len(text) <= max_len:
        return [text]

    chunks = []
    sentences = text.replace("。", "。\n").replace("！", "！\n").replace("？", "？\n").split("\n")

    current = ""
    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        if len(current) + len(sent) > max_len and current:
            chunks.append(current.strip())
            current = sent
        else:
            current += sent

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text[:max_len]]
