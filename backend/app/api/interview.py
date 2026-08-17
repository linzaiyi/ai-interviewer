import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.interview import Interview
from app.models.question import JobPosition
from app.schemas import (
    InterviewStartRequest, InterviewChatRequest, InterviewChatResponse,
    InterviewHistoryItem, EvaluationResponse,
)
from app.services import interview_service
from sqlalchemy import select, desc

router = APIRouter(prefix="/api/interview", tags=["interview"])


@router.post("/start", response_model=InterviewChatResponse)
async def start_interview(
    data: InterviewStartRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 获取岗位能力模型
    result = await db.execute(
        select(JobPosition).where(JobPosition.name == data.position)
    )
    job_position = result.scalar_one_or_none()
    if not job_position:
        raise HTTPException(status_code=404, detail="岗位不存在")

    # 构建求职者画像（来自前端传来的表单数据）
    profile = {
        "target_industry": data.target_industry or "",
        "school": data.school or "",
        "degree": data.degree or "",
        "graduation_year": data.graduation_year or "",
        "target_city": data.target_city or "",
        "personal_summary": data.personal_summary or "",
    }

    # 启动面试 Agent
    session_key, opening = await interview_service.start_interview(
        position=data.position,
        profile=profile,
        ability_model=job_position.ability_model,
        weakness_areas=data.skill_gaps or [],
        resume_data=data.resume_data,
    )

    user_id = current_user["user_id"] if current_user else None

    # 创建面试记录
    interview = Interview(
        user_id=user_id,
        guest_session_id=data.guest_session_id,
        position=data.position,
        session_key=session_key,  # 持久化存储 session_key
        status="in_progress",
        started_at=datetime.now(timezone.utc),
    )
    db.add(interview)
    await db.commit()
    await db.refresh(interview)

    return InterviewChatResponse(
        interview_id=interview.id,
        role="interviewer",
        content=opening,
        is_complete=False,
        session_key=session_key,
        round_number=1,
        max_rounds=12,
    )


@router.post("/chat", response_model=InterviewChatResponse)
async def chat(
    data: InterviewChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 优先使用请求中的 session_key，否则从数据库查询
    session_key = data.session_key
    interview = None
    if not session_key and data.interview_id:
        result = await db.execute(
            select(Interview).where(Interview.id == data.interview_id)
        )
        interview = result.scalar_one_or_none()
        if interview and interview.session_key:
            session_key = interview.session_key
    if not session_key:
        raise HTTPException(status_code=400, detail="面试会话不存在或已过期，请重新开始面试")

    # 处理对话
    try:
        response = await interview_service.chat(
            session_key=session_key,
            user_message=data.message,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 更新面试记录（如果有 interview_id）
    if not interview and data.interview_id:
        result = await db.execute(
            select(Interview).where(Interview.id == data.interview_id)
        )
        interview = result.scalar_one_or_none()

    if interview:
        conversation = interview.conversation or []
        conversation.append({"role": "candidate", "content": data.message})
        conversation.append({"role": "interviewer", "content": response["content"]})
        interview.conversation = conversation

        if response["is_complete"]:
            interview.status = "completed"
            interview.completed_at = datetime.now(timezone.utc)
            eval_result = await interview_service.async_end_interview(session_key)
            interview.total_score = eval_result.get("total_score")
            interview.dimension_scores = eval_result.get("dimension_scores")
            interview.question_reviews = eval_result.get("question_reviews")
            interview.overall_feedback = eval_result.get("overall_feedback")
            interview.improvement_suggestions = eval_result.get("improvement_suggestions")

        await db.commit()

    return InterviewChatResponse(
        role="interviewer",
        content=response["content"],
        is_complete=response["is_complete"],
        round_number=response.get("round_number", 0),
        max_rounds=response.get("max_rounds", 12),
    )


@router.get("/history", response_model=list[InterviewHistoryItem])
async def get_history(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 只有登录用户才能查看历史记录
    if not current_user:
        raise HTTPException(status_code=401, detail="请先登录后查看面试历史")

    result = await db.execute(
        select(Interview)
        .where(Interview.user_id == current_user["user_id"])
        .order_by(desc(Interview.created_at))
        .limit(20)
    )

    interviews = result.scalars().all()
    return [
        InterviewHistoryItem(
            id=i.id,
            position=i.position,
            status=i.status,
            total_score=i.total_score,
            created_at=i.created_at,
        )
        for i in interviews
    ]


@router.get("/{interview_id}/evaluation", response_model=EvaluationResponse)
async def get_evaluation(
    interview_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="面试记录不存在")

    # 权限校验：只能查看自己的评估
    if interview.user_id and current_user and interview.user_id != current_user.get("user_id"):
        raise HTTPException(status_code=403, detail="无权查看此面试记录")

    return EvaluationResponse(
        total_score=interview.total_score or 0,
        dimension_scores=interview.dimension_scores or {},
        question_reviews=interview.question_reviews or [],
        overall_feedback=interview.overall_feedback or "",
        improvement_suggestions=interview.improvement_suggestions if isinstance(interview.improvement_suggestions, list) else [],
    )


@router.post("/{interview_id}/end")
async def end_interview_early(
    interview_id: int,
    db: AsyncSession = Depends(get_db),
):
    """提前结束面试并生成报告"""
    result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="面试记录不存在")

    if interview.status == "completed":
        # 已完成，直接返回
        return {"interview_id": interview.id, "status": "completed"}

    session_key = interview.session_key
    if not session_key:
        raise HTTPException(status_code=400, detail="面试会话已过期，无法生成报告")

    try:
        eval_result = await interview_service.async_end_interview(session_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    interview.status = "completed"
    interview.completed_at = datetime.now(timezone.utc)
    interview.total_score = eval_result.get("total_score")
    interview.dimension_scores = eval_result.get("dimension_scores")
    interview.question_reviews = eval_result.get("question_reviews")
    interview.overall_feedback = eval_result.get("overall_feedback")
    interview.improvement_suggestions = eval_result.get("improvement_suggestions")
    await db.commit()

    return {"interview_id": interview.id, "status": "completed"}


@router.get("/{interview_id}/report")
async def get_report(
    interview_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取面试报告（无需登录，游客也可查看）"""
    result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="面试记录不存在")

    if interview.status != "completed":
        raise HTTPException(status_code=400, detail="面试尚未完成，无法生成报告")

    return {
        "interview_id": interview.id,
        "position": interview.position,
        "total_score": interview.total_score or 0,
        "dimension_scores": interview.dimension_scores or {},
        "question_reviews": interview.question_reviews or [],
        "overall_feedback": interview.overall_feedback or "",
        "improvement_suggestions": interview.improvement_suggestions if isinstance(interview.improvement_suggestions, list) else [],
    }


@router.get("/tts")
async def get_tts(text: str = ""):
    """获取面试官回复的语音"""
    if not text:
        raise HTTPException(status_code=400, detail="缺少文本参数")
    audio_bytes = await interview_service.generate_tts(text)
    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/mpeg",
    )