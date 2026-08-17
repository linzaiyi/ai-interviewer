from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.profile import Profile
from app.schemas import ProfileCreate, ProfileResponse
from sqlalchemy import select

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.post("", response_model=ProfileResponse)
async def create_or_update_profile(
    data: ProfileCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = current_user["user_id"]

    # 查找已有画像
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()

    if profile:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, key, value)
    else:
        profile = Profile(user_id=user_id, **data.model_dump())
        db.add(profile)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("", response_model=ProfileResponse | None)
async def get_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user is None:
        return None

    result = await db.execute(select(Profile).where(Profile.user_id == current_user["user_id"]))
    return result.scalar_one_or_none()