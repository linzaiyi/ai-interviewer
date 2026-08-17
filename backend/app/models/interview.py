from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Text, Float, DateTime, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class Interview(Base, TimestampMixin):
    __tablename__ = "interviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    guest_session_id: Mapped[str] = mapped_column(String(100), nullable=True, index=True)

    # 面试配置
    position: Mapped[str] = mapped_column(String(100), nullable=False)          # 面试岗位
    session_key: Mapped[str] = mapped_column(String(64), nullable=True)          # 活跃会话 key，用于关联 Agent
    status: Mapped[str] = mapped_column(String(20), default="in_progress")      # in_progress / completed
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # 面试对话记录
    conversation: Mapped[dict] = mapped_column(JSONB, default=list)             # [{role, content, timestamp}]

    # 评分结果
    total_score: Mapped[float] = mapped_column(Float, nullable=True)            # 综合评分
    dimension_scores: Mapped[dict] = mapped_column(JSONB, nullable=True)        # 分维度评分
    question_reviews: Mapped[dict] = mapped_column(JSONB, nullable=True)        # 每题点评
    overall_feedback: Mapped[str] = mapped_column(Text, nullable=True)          # 整体评价
    improvement_suggestions: Mapped[dict] = mapped_column(JSONB, nullable=True) # 改进建议

    user = relationship("User", back_populates="interviews")