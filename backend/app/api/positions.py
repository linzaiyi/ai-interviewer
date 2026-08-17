from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.question import JobPosition
from app.schemas import PositionResponse
from sqlalchemy import select

router = APIRouter(prefix="/api/positions", tags=["positions"])


@router.get("", response_model=list[PositionResponse])
async def list_positions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(JobPosition))
    positions = result.scalars().all()
    return [PositionResponse.model_validate(p) for p in positions]


@router.get("/{position_id}", response_model=PositionResponse)
async def get_position(position_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(JobPosition).where(JobPosition.id == position_id))
    position = result.scalar_one_or_none()
    if not position:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="岗位不存在")
    return PositionResponse.model_validate(position)