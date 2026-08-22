import json
import re
from app.ai.llm import get_llm
from app.ai.prompts import RESUME_PARSE_PROMPT


class ResumeParser:
    """简历解析器"""

    def __init__(self):
        self.llm = get_llm(temperature=0)  # 简历分析需要稳定一致的结果

    def parse(
        self,
        resume_text: str,
        position: str,
        industry: str,
        ability_model: list[dict],
        school: str,
        degree: str,
        graduation_year: int,
        target_city: str,
        personal_summary: str,
    ) -> dict:
        """解析简历并返回结构化分析结果"""
        prompt = RESUME_PARSE_PROMPT.format(
            position=position,
            industry=industry or "不限",
            ability_model=json.dumps(ability_model, ensure_ascii=False, indent=2),
            school=school or "未知",
            degree=degree or "未知",
            graduation_year=graduation_year or "未知",
            target_city=target_city or "不限",
            personal_summary=personal_summary or "无",
            resume_text=resume_text[:3000],  # 限制长度
        )

        messages = [{"role": "user", "content": prompt}]
        response = self.llm.invoke(messages)
        content = response.content

        # 提取 JSON
        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        # 解析失败时返回默认结构
        return {
            "match_score": 0,
            "ability_scores": {d["name"]: 0 for d in ability_model},
            "skill_gaps": [],
            "parsed_data": {},
            "analysis_summary": "简历解析失败，请重试",
            "recommended_focus": [],
        }

    async def parse_async(
        self,
        resume_text: str,
        position: str,
        industry: str,
        ability_model: list[dict],
        school: str,
        degree: str,
        graduation_year: int,
        target_city: str,
        personal_summary: str,
    ) -> dict:
        """异步解析简历（用于 FastAPI async 端点）"""
        prompt = RESUME_PARSE_PROMPT.format(
            position=position,
            industry=industry or "不限",
            ability_model=json.dumps(ability_model, ensure_ascii=False, indent=2),
            school=school or "未知",
            degree=degree or "未知",
            graduation_year=graduation_year or "未知",
            target_city=target_city or "不限",
            personal_summary=personal_summary or "无",
            resume_text=resume_text[:3000],
        )

        messages = [{"role": "user", "content": prompt}]
        response = await self.llm.ainvoke(messages)
        content = response.content

        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        return {
            "match_score": 0,
            "ability_scores": {d["name"]: 0 for d in ability_model},
            "skill_gaps": [],
            "parsed_data": {},
            "analysis_summary": "简历解析失败，请重试",
            "recommended_focus": [],
        }