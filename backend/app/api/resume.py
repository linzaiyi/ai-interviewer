import hashlib
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.resume import Resume
from app.models.question import JobPosition
from app.services.resume_service import extract_text, save_upload
from app.ai.parser import ResumeParser
from app.schemas import ResumeAnalysisResponse
from sqlalchemy import select

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.post("/upload", response_model=ResumeAnalysisResponse)
async def upload_resume(
    file: UploadFile = File(...),
    position: str = Form(...),
    target_industry: str = Form(""),
    school: str = Form(""),
    degree: str = Form(""),
    graduation_year: int = Form(0),
    target_city: str = Form(""),
    personal_summary: str = Form(""),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 提取文本
    try:
        raw_text = extract_text(file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 保存文件
    filepath, filename = save_upload(file)

    # 获取岗位能力模型
    result = await db.execute(
        select(JobPosition).where(JobPosition.name == position)
    )
    job_position = result.scalar_one_or_none()
    ability_model = job_position.ability_model if job_position else []

    # 同一份简历内容 + 同一岗位 → 直接返回缓存结果，避免 LLM 波动
    content_hash = hashlib.sha256(raw_text.encode()).hexdigest()
    result = await db.execute(
        select(Resume).where(
            Resume.raw_text == raw_text,
            Resume.match_score.isnot(None)
        ).order_by(Resume.created_at.desc()).limit(1)
    )
    cached = result.scalar_one_or_none()
    if cached:
        return ResumeAnalysisResponse(
            match_score=cached.match_score or 0,
            ability_scores=cached.ability_scores or {},
            skill_gaps=cached.skill_gaps or [],
            parsed_data=cached.parsed_data or {},
            analysis_summary=cached.analysis_summary or "",
            recommended_focus=cached.parsed_data.get("recommended_focus", []) if cached.parsed_data else [],
        )

    # AI 解析
    parser = ResumeParser()
    analysis = parser.parse(
        resume_text=raw_text,
        position=position,
        industry=target_industry,
        ability_model=ability_model,
        school=school,
        degree=degree,
        graduation_year=graduation_year,
        target_city=target_city,
        personal_summary=personal_summary,
    )

    # 保存到数据库（将 recommended_focus 合并到 parsed_data 中存储）
    user_id = current_user["user_id"] if current_user else None
    parsed = analysis.get("parsed_data") or {}
    parsed["recommended_focus"] = analysis.get("recommended_focus", [])
    resume = Resume(
        user_id=user_id,
        original_filename=filename,
        file_path=filepath,
        raw_text=raw_text,
        match_score=analysis.get("match_score"),
        ability_scores=analysis.get("ability_scores"),
        skill_gaps=analysis.get("skill_gaps"),
        parsed_data=parsed,
        analysis_summary=analysis.get("analysis_summary"),
    )
    db.add(resume)
    await db.commit()

    return ResumeAnalysisResponse(
        match_score=analysis.get("match_score", 0),
        ability_scores=analysis.get("ability_scores", {}),
        skill_gaps=analysis.get("skill_gaps", []),
        parsed_data=analysis.get("parsed_data", {}),
        analysis_summary=analysis.get("analysis_summary", ""),
        recommended_focus=analysis.get("recommended_focus", []),
    )