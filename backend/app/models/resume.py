from sqlalchemy import String, Integer, ForeignKey, Text, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class Resume(Base, TimestampMixin):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)  # 游客时为 None
    guest_session_id: Mapped[str] = mapped_column(String(100), nullable=True, index=True)

    # 文件信息
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=True)  # 提取的原始文本

    # AI 解析结果
    match_score: Mapped[float] = mapped_column(Float, nullable=True)             # 综合匹配度
    ability_scores: Mapped[dict] = mapped_column(JSONB, nullable=True)           # 各维度评分
    skill_gaps: Mapped[dict] = mapped_column(JSONB, nullable=True)               # 能力缺口
    parsed_data: Mapped[dict] = mapped_column(JSONB, nullable=True)              # 结构化简历数据
    analysis_summary: Mapped[str] = mapped_column(Text, nullable=True)           # AI 分析总结