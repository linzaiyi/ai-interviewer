from sqlalchemy import String, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin


class JobPosition(Base, TimestampMixin):
    __tablename__ = "job_positions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)   # 岗位名称
    industry: Mapped[str] = mapped_column(String(100), nullable=True)             # 适用行业
    description: Mapped[str] = mapped_column(Text, nullable=True)                 # 岗位描述
    ability_model: Mapped[dict] = mapped_column(JSONB, nullable=False)            # 能力模型 [{name, weight, description}]


class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    position_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 关联岗位
    ability_dimension: Mapped[str] = mapped_column(String(100), nullable=False)    # 能力维度
    difficulty: Mapped[str] = mapped_column(String(20), default="medium")          # easy / medium / hard
    content: Mapped[str] = mapped_column(Text, nullable=False)                     # 题目内容
    reference_answer: Mapped[str] = mapped_column(Text, nullable=True)             # 参考答案要点
    scoring_criteria: Mapped[dict] = mapped_column(JSONB, nullable=True)           # 评分标准