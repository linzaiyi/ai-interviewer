from sqlalchemy import String, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class Profile(Base, TimestampMixin):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    # 求职者画像
    target_position: Mapped[str] = mapped_column(String(100), nullable=False)  # 目标岗位
    target_industry: Mapped[str] = mapped_column(String(100), nullable=True)   # 目标行业
    school: Mapped[str] = mapped_column(String(200), nullable=True)            # 毕业院校
    degree: Mapped[str] = mapped_column(String(50), nullable=True)             # 学历
    graduation_year: Mapped[int] = mapped_column(Integer, nullable=True)       # 毕业年份
    target_city: Mapped[str] = mapped_column(String(100), nullable=True)       # 期望城市
    personal_summary: Mapped[str] = mapped_column(Text, nullable=True)         # 个人情况简述

    user = relationship("User", back_populates="profile")