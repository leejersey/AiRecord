"""
Pydantic 数据模型 — 请求 / 响应 Schema
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from enum import Enum
from datetime import datetime


class SceneType(str, Enum):
    meeting = "meeting"
    interview = "interview"
    idea = "idea"
    general = "general"


class RecordingStatus(str, Enum):
    uploaded = "uploaded"
    transcribing = "transcribing"
    transcribed = "transcribed"
    analyzing = "analyzing"
    done = "done"
    failed = "failed"


# ========== Response Models ==========

class Utterance(BaseModel):
    text: str
    start_time: float
    end_time: float


class ActionItem(BaseModel):
    task: str
    assignee: Optional[str] = None
    deadline: Optional[str] = None


class AnalysisResult(BaseModel):
    summary: Optional[str] = None
    key_points: Optional[List[str]] = None
    action_items: Optional[List[ActionItem]] = None
    sentiment: Optional[str] = None
    topics: Optional[List[str]] = None
    follow_up_questions: Optional[List[str]] = None
    raw: Optional[dict] = None  # 原始 AI 返回，用于兜底


class RecordingResponse(BaseModel):
    id: str
    title: str
    audio_path: str
    audio_format: str
    duration: float
    file_size: int
    transcript: Optional[str] = None
    utterances: Optional[List[Utterance]] = None
    analysis: Optional[AnalysisResult] = None
    scene_type: SceneType
    status: RecordingStatus
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class RecordingListResponse(BaseModel):
    items: List[RecordingResponse]
    total: int


class StatusResponse(BaseModel):
    id: str
    status: RecordingStatus
    error_message: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"


# ========== Request Models ==========

class RecordingUpdate(BaseModel):
    title: Optional[str] = None
    scene_type: Optional[SceneType] = None


# ========== Todo Models ==========

class TodoStatus(str, Enum):
    pending = "pending"
    done = "done"
    overdue = "overdue"


class TodoResponse(BaseModel):
    id: str
    recording_id: str
    task: str
    assignee: Optional[str] = None
    deadline: Optional[str] = None
    status: TodoStatus
    resolved_by: Optional[str] = None
    source_scene: Optional[str] = None
    created_at: str
    updated_at: str


class TodoListResponse(BaseModel):
    items: List[TodoResponse]
    total: int


class TodoUpdate(BaseModel):
    status: Optional[TodoStatus] = None
    assignee: Optional[str] = None
    deadline: Optional[str] = None
