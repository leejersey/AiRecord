"""
DeepSeek AI 分析服务 — 三场景 Prompt 调用
"""
import json
import logging
from openai import AsyncOpenAI
from app.config import get_settings

logger = logging.getLogger(__name__)

# ========== Prompt 模板 ==========

PROMPT_MEETING = """你是一个专业的会议记录分析助手。请分析以下会议录音转录文本，以 JSON 格式输出：

```
{transcript}
```

请输出以下结构的 JSON（直接输出 JSON，不要包裹 markdown 代码块）：
{{
  "summary": "会议摘要（2-3 句话）",
  "key_points": ["关键决策1", "关键决策2", ...],
  "action_items": [
    {{"task": "待办事项", "assignee": "负责人", "deadline": "截止日期"}}
  ],
  "highlights": [
    {{"label": "重要时刻简述", "keyword": "在转录文本中的关键词或短语"}}
  ],
  "sentiment": "整体情感倾向（积极/中性/消极）",
  "topics": ["讨论话题1", "讨论话题2"],
  "follow_up_questions": ["需要跟进的问题"]
}}"""

PROMPT_INTERVIEW = """你是一个资深的 HR 面试评估专家。请分析以下面试录音转录文本，以 JSON 格式输出：

```
{transcript}
```

请输出以下结构的 JSON（直接输出 JSON，不要包裹 markdown 代码块）：
{{
  "summary": "面试概况（2-3 句话）",
  "candidate_assessment": {{
    "technical_skill": {{"score": 1-10, "comment": "评价"}},
    "communication": {{"score": 1-10, "comment": "评价"}},
    "logical_thinking": {{"score": 1-10, "comment": "评价"}},
    "culture_fit": {{"score": 1-10, "comment": "评价"}}
  }},
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["不足1", "不足2"],
  "key_qa": [
    {{"question": "关键问题", "answer_quality": "回答质量评价"}}
  ],
  "recommendation": "录用建议（强烈推荐/推荐/待定/不推荐）",
  "sentiment": "面试氛围",
  "topics": ["考察方向"]
}}"""

PROMPT_IDEA = """你是一个创意思维教练和结构化思维专家。请分析以下灵感录音转录文本，以 JSON 格式输出：

```
{transcript}
```

请输出以下结构的 JSON（直接输出 JSON，不要包裹 markdown 代码块）：
{{
  "summary": "核心想法概述（2-3 句话）",
  "core_ideas": ["核心想法1", "核心想法2"],
  "structured_outline": [
    {{"title": "结构化标题", "content": "详细内容"}}
  ],
  "action_items": [
    {{"task": "下一步行动", "priority": "高/中/低"}}
  ],
  "highlights": [
    {{"label": "灵感闪光点", "keyword": "转录文本中的关键词"}}
  ],
  "related_inspirations": ["相关联想1", "相关联想2"],
  "sentiment": "整体基调",
  "topics": ["涉及领域"]
}}"""

PROMPTS = {
    "meeting": PROMPT_MEETING,
    "interview": PROMPT_INTERVIEW,
    "idea": PROMPT_IDEA,
    "general": PROMPT_MEETING,  # 默认使用会议模板
}


async def analyze_transcript(transcript: str, scene_type: str) -> dict:
    """
    调用 DeepSeek 分析转录文本

    Args:
        transcript: 转录全文
        scene_type: 场景类型 (meeting/interview/idea)

    Returns:
        结构化分析结果字典
    """
    settings = get_settings()

    if not settings.deepseek_api_key:
        raise RuntimeError("DeepSeek API Key 未配置")

    prompt_template = PROMPTS.get(scene_type, PROMPT_MEETING)
    prompt = prompt_template.format(transcript=transcript)

    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一个专业的分析助手，请严格按照 JSON 格式输出结果。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        content = response.choices[0].message.content.strip()
        logger.info(f"DeepSeek 原始返回长度: {len(content)}")

        # 解析 JSON
        analysis = _parse_json_response(content)
        return analysis

    except Exception as e:
        logger.error(f"DeepSeek 调用异常: {str(e)}")
        raise RuntimeError(f"AI 分析失败: {str(e)}")


async def analyze_with_pending_todos(
    transcript: str, scene_type: str, pending_todos: list[dict]
) -> dict:
    """
    带待办闭环的分析：在分析新录音时，同时判断哪些旧待办已在本次录音中被提及/完成

    Args:
        transcript: 转录全文
        scene_type: 场景类型
        pending_todos: 未完成待办列表 [{"id": "xxx", "task": "xxx"}, ...]

    Returns:
        分析结果字典，额外包含 resolved_todo_ids 字段
    """
    settings = get_settings()

    if not settings.deepseek_api_key:
        raise RuntimeError("DeepSeek API Key 未配置")

    prompt_template = PROMPTS.get(scene_type, PROMPT_MEETING)
    prompt = prompt_template.format(transcript=transcript)

    # 追加待办闭环指令
    if pending_todos:
        todo_list = "\n".join([f'  - ID: {t["id"]}, 任务: {t["task"]}' for t in pending_todos])
        prompt += f"""

---
**额外任务**：以下是之前遗留的未完成待办事项：
{todo_list}

请在你的 JSON 输出中增加一个字段 "resolved_todo_ids"，包含本次录音中明确提到已完成、已解决或不再需要的待办 ID 列表。
例如: "resolved_todo_ids": ["abc123", "def456"]
如果没有待办被解决，返回空数组: "resolved_todo_ids": []"""

    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一个专业的分析助手，请严格按照 JSON 格式输出结果。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        content = response.choices[0].message.content.strip()
        logger.info(f"DeepSeek (with todos) 原始返回长度: {len(content)}")

        analysis = _parse_json_response(content)
        return analysis

    except Exception as e:
        logger.error(f"DeepSeek 调用异常: {str(e)}")
        raise RuntimeError(f"AI 分析失败: {str(e)}")


def _parse_json_response(content: str) -> dict:
    """
    从 AI 返回中提取 JSON，处理可能的 markdown 包裹

    容错策略:
    1. 直接解析 JSON
    2. 去除 markdown 代码块后解析
    3. 全部失败时返回 raw 内容
    """
    # 尝试 1: 直接解析
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # 尝试 2: 去除 markdown 代码块
    cleaned = content
    if "```json" in cleaned:
        cleaned = cleaned.split("```json", 1)[1]
    if "```" in cleaned:
        cleaned = cleaned.split("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 尝试 3: 找到第一个 { 和最后一个 }
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(content[start:end + 1])
        except json.JSONDecodeError:
            pass

    # 全部失败，返回原始文本
    logger.warning("无法解析 AI 返回为 JSON，返回原始内容")
    return {"summary": content, "raw_response": True}


# ========== RAG 对话式查询 ==========

PROMPT_RAG = """你是一个智能录音助手。用户正在查询他们的录音历史记录。

以下是从知识库中检索到的相关录音片段：

---
{context}
---

用户的问题是：{question}

请基于上述内容准确、简洁地回答用户的问题。注意：
1. 只基于提供的上下文回答，不要编造不存在的内容
2. 如果上下文不足以回答，请诚实告知
3. 在回答中引用具体来源（录音标题）
4. 使用中文回答"""


async def analyze_with_context(question: str, context: str) -> str:
    """
    RAG 对话式查询 — 基于检索上下文回答用户问题

    Args:
        question: 用户问题
        context: 从 ChromaDB 检索到的上下文

    Returns:
        AI 生成的回答文本
    """
    settings = get_settings()

    if not settings.deepseek_api_key:
        return "AI 服务未配置，请设置 DeepSeek API Key"

    prompt = PROMPT_RAG.format(context=context, question=question)

    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com",
    )

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一个专业的录音分析助手，帮助用户从录音历史中获取信息。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"RAG 查询失败: {e}")
        return f"查询处理失败: {str(e)}"
