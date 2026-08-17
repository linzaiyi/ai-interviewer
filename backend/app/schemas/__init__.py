from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# ========== Auth ==========
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ========== Profile ==========
class ProfileCreate(BaseModel):
    target_position: str
    target_industry: Optional[str] = None
    school: Optional[str] = None
    degree: Optional[str] = None
    graduation_year: Optional[int] = None
    target_city: Optional[str] = None
    personal_summary: Optional[str] = None


class ProfileResponse(ProfileCreate):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ========== Resume ==========
class ResumeAnalysisResponse(BaseModel):
    match_score: float
    ability_scores: dict  # {dimension: score}
    skill_gaps: list[str]
    parsed_data: dict
    analysis_summary: str
    recommended_focus: list[str]  # 建议重点考察方向


# ========== Interview ==========
class InterviewStartRequest(BaseModel):
    position: str
    guest_session_id: Optional[str] = None
    # 候选人画像信息
    target_industry: str = ""
    school: str = ""
    degree: str = ""
    graduation_year: str = ""
    target_city: str = ""
    personal_summary: str = ""
    # 简历分析结果（让 AI 面试官了解候选人背景）
    resume_data: Optional[dict] = None
    skill_gaps: list[str] = []
    recommended_focus: list[str] = []


class InterviewChatRequest(BaseModel):
    interview_id: Optional[int] = None
    session_key: Optional[str] = None
    message: str
    guest_session_id: Optional[str] = None


class InterviewChatResponse(BaseModel):
    interview_id: Optional[int] = None
    role: str  # "interviewer" | "candidate"
    content: str
    is_complete: bool = False
    session_key: Optional[str] = None  # 面试会话 key，用于后续对话
    audio_url: Optional[str] = None  # TTS 语音 URL
    round_number: int = 0  # 当前轮次
    max_rounds: int = 12  # 最大轮次


class InterviewHistoryItem(BaseModel):
    id: int
    position: str
    status: str
    total_score: Optional[float]
    created_at: datetime

    model_config = {"from_attributes": True}


# ========== Evaluation ==========
class EvaluationResponse(BaseModel):
    total_score: float
    dimension_scores: dict
    question_reviews: list[dict]
    overall_feedback: str
    improvement_suggestions: list[str]


# ========== Position ==========
class PositionResponse(BaseModel):
    id: int
    name: str
    industry: Optional[str]
    description: Optional[str]
    ability_model: list[dict]

    model_config = {"from_attributes": True}