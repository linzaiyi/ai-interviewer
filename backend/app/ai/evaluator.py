import json
import re
from app.ai.llm import get_llm
from app.ai.prompts import EVALUATION_PROMPT


def _strip_numbering(text: str) -> str:
    """去除 LLM 生成的编号前缀，如 '建议1: '、'1. '、'建议一: '、'建议1、'"""
    return re.sub(
        r'^(建议\s*\d+\s*[：:、，．,.\s]+|建议\s*[一二三四五六七八九十]+\s*[：:、，．,.\s]+|\d+[\.\、．]\s*|[一二三四五六七八九十]+[、．.]\s*)',
        '',
        text
    ).strip()


def _looks_like_no_data(text: str) -> bool:
    """检查文本是否表示缺少数据"""
    keywords = ["无法获取", "无法评估", "没有相关", "未进行", "没有进行", "没有提供", "不充分", "无相关信息"]
    return any(kw in text for kw in keywords)


class Evaluator:
    """面试评分器"""

    def __init__(self):
        self.llm = get_llm(temperature=0.2)

    async def evaluate(self, position: str, ability_model: list[dict], conversation: list[dict]) -> dict:
        """对面试对话进行评分"""
        conversation_text = "\n".join([
            f"{'面试官' if m['role'] == 'interviewer' else '候选人'}: {m['content']}"
            for m in conversation
        ])

        # 检查对话是否足够进行有意义的评分
        candidate_msgs = [m for m in conversation if m["role"] == "candidate"]
        has_insufficient_data = len(candidate_msgs) < 2

        prompt = EVALUATION_PROMPT.format(
            position=position,
            ability_model=json.dumps(ability_model, ensure_ascii=False, indent=2),
            conversation=conversation_text,
            data_note="注意：对话轮次较少，评分可能不够准确。请根据实际回答质量诚实评分，无法判断的维度给 0 分。" if has_insufficient_data else ""
        )

        messages = [{"role": "user", "content": prompt}]
        response = await self.llm.ainvoke(messages)
        content = response.content

        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if not json_match:
            return self._empty_result(ability_model, "评分失败，请重试")

        try:
            result = json.loads(json_match.group())
        except json.JSONDecodeError:
            return self._empty_result(ability_model, "评分失败，请重试")

        # 清洗 improvement_suggestions：支持两种格式
        raw_suggestions = result.get("improvement_suggestions", [])
        if isinstance(raw_suggestions, dict):
            # 新格式：{维度名: [建议列表]}
            cleaned_suggestions = {}
            for dim, suggestions in raw_suggestions.items():
                if isinstance(suggestions, list):
                    cleaned = [_strip_numbering(s) for s in suggestions if isinstance(s, str)]
                    cleaned = [s for s in cleaned if s]
                    cleaned_suggestions[dim] = cleaned
                else:
                    cleaned_suggestions[dim] = []
            result["improvement_suggestions"] = cleaned_suggestions
        elif isinstance(raw_suggestions, list):
            # 旧格式：扁平列表，保留兼容
            cleaned_suggestions = [_strip_numbering(s) for s in raw_suggestions if isinstance(s, str)]
            cleaned_suggestions = [s for s in cleaned_suggestions if s]
            result["improvement_suggestions"] = cleaned_suggestions
        else:
            result["improvement_suggestions"] = {}

        # 清洗 question_reviews：去除编号，并修正不一致的评分
        raw_reviews = result.get("question_reviews", [])
        for review in raw_reviews:
            if isinstance(review, dict):
                # 清洗编号
                for key in ("strength", "improvement"):
                    if key in review and isinstance(review[key], str):
                        review[key] = _strip_numbering(review[key])
                # 如果文本显示无数据但分数 > 0，修正为 0
                if _looks_like_no_data(str(review.get("strength", ""))) and review.get("score", 0) > 0:
                    review["score"] = 0
                    review["strength"] = "回答内容不足，无法评估"
                if _looks_like_no_data(str(review.get("improvement", ""))) and review.get("score", 0) > 0:
                    review["improvement"] = "回答内容不足，无法给出具体建议"
        result["question_reviews"] = raw_reviews

        # 验证 total_score 合理性
        if result.get("total_score", 0) == 0 and not has_insufficient_data:
            result["overall_feedback"] = result.get("overall_feedback", "评分失败，请重试")

        return result

    def _empty_result(self, ability_model: list[dict], feedback: str) -> dict:
        return {
            "total_score": 0,
            "dimension_scores": {d["name"]: 0 for d in ability_model},
            "question_reviews": [],
            "overall_feedback": feedback,
            "improvement_suggestions": [],
        }