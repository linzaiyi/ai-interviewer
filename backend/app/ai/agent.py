import asyncio
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from app.ai.llm import get_llm
from app.ai.prompts import INTERVIEW_SYSTEM_PROMPT
from app.ai.rag import search_questions


class InterviewAgent:
    """面试对话 Agent"""

    def __init__(self, position: str, profile: dict, ability_model: list[dict], weakness_areas: list[str], resume_data: dict | None = None):
        self.position = position
        self.profile = profile
        self.ability_model = ability_model
        self.weakness_areas = weakness_areas
        self.resume_data = resume_data
        self.llm = get_llm(temperature=0.8)
        self.history: list = []
        self.round_number = 0
        self.completed_dimensions: set = set()
        self.max_rounds = 3

    def _build_progress_str(self) -> str:
        """构建能力维度进度字符串"""
        total = len(self.ability_model)
        covered = len(self.completed_dimensions)
        dimensions = [d["name"] for d in self.ability_model]
        progress = "\n".join([
            f"  - {d['name']}（权重{d['weight']}%）：{'✅ 已考察' if d['name'] in self.completed_dimensions else '❌ 未考察'}"
            for d in self.ability_model
        ])
        return f"已完成 {covered}/{total} 个维度：\n{progress}"

    def _build_system_prompt(self) -> str:
        return INTERVIEW_SYSTEM_PROMPT.format(
            company_type=self.profile.get("target_industry", "科技"),
            position=self.position,
            school=self.profile.get("school", "未知"),
            degree=self.profile.get("degree", "未知"),
            graduation_year=self.profile.get("graduation_year", "未知"),
            personal_summary=self.profile.get("personal_summary", "无"),
            weakness_areas="、".join(self.weakness_areas) if self.weakness_areas else "综合考察",
            progress=self._build_progress_str(),
            round_number=self.round_number + 1,
            resume_context=self._build_resume_context(),
        )

    def _build_resume_context(self) -> str:
        """从简历数据中提取候选人背景供 AI 面试官参考"""
        if not self.resume_data:
            return "（候选人未上传简历，请根据其自我介绍灵活提问）"
        parts = []
        rd = self.resume_data
        # 项目经历
        projects = rd.get("projects", [])
        if projects:
            parts.append("【候选人项目经历】")
            for p in projects:
                name = p.get("name", p.get("project_name", ""))
                desc = p.get("description", p.get("description", ""))
                if name:
                    parts.append(f"- {name}：{desc}" if desc else f"- {name}")
        # 实习/工作经历
        experiences = rd.get("experience", rd.get("experiences", []))
        if experiences:
            parts.append("【候选人实习/工作经历】")
            for e in experiences:
                company = e.get("company", e.get("company_name", ""))
                role = e.get("role", e.get("position", ""))
                parts.append(f"- {company} {role}".strip())
        # 技能
        skills = rd.get("skills", [])
        if skills:
            skills_str = "、".join(skills) if isinstance(skills, list) else str(skills)
            parts.append(f"【候选人技能】{skills_str}")
        return "\n".join(parts) if parts else "（候选人已上传简历，但未提取到项目/经历详情）"

    async def generate_opening(self) -> str:
        """生成开场白"""
        self.round_number = 1
        prompt = self._build_system_prompt() + "\n\n请生成面试开场白：先简单介绍自己（面试官），然后请候选人做一段1-2分钟的自我介绍。语气要轻松友好，不要一上来就问技术问题。"
        messages = [SystemMessage(content=prompt)]
        try:
            response = await self.llm.ainvoke(messages)
        except Exception as e:
            print(f"LLM ainvoke failed in generate_opening: {e}", flush=True)
            return f"你好！我是 AI 面试官，今天由我来和你聊聊。请先简单介绍一下自己吧。（注意：AI 服务暂时不稳定，如果后续回复异常请稍后重试）"
        content = response.content
        self.history.append({"role": "interviewer", "content": content})
        return content

    async def respond(self, user_message: str) -> dict:
        """处理候选人回答，返回 AI 面试官响应"""
        self.history.append({"role": "candidate", "content": user_message})
        self.round_number += 1

        # 确定当前轮要考察的能力维度（轮询未覆盖的维度）
        remaining = [d for d in self.ability_model if d["name"] not in self.completed_dimensions]
        current_dimension = remaining[0] if remaining else None

        # 构建消息历史
        messages = [SystemMessage(content=self._build_system_prompt())]
        for msg in self.history:
            if msg["role"] == "interviewer":
                messages.append(AIMessage(content=msg["content"]))
            else:
                messages.append(HumanMessage(content=msg["content"]))

        # 判断是否所有维度都已覆盖
        all_covered = len(self.completed_dimensions) >= len(self.ability_model)
        if all_covered and current_dimension is None:
            end_instruction = (
                '\n\n所有能力维度已经考察完毕。请根据候选人的回答进行追问，提出一个开放式问题或深入追问，而不是结束面试。'
                '\n注意：不要主动结束面试，让候选人自己决定何时结束。'
            )
        elif current_dimension:
            dimension_name = current_dimension["name"]
            dimension_desc = current_dimension.get("description", dimension_name)
            # RAG 检索：从题库中查找与该维度相关的参考题目
            rag_context = ""
            try:
                rag_questions = search_questions(self.position, f"{dimension_name} {dimension_desc}", 3)
                if rag_questions:
                    rag_context = "\n\n以下是从题库中检索到的参考题目，供你参考出题风格和方向：\n"
                    for i, q in enumerate(rag_questions, 1):
                        rag_context += f"{i}. {q['content']}\n"
                        if q.get("reference_answer"):
                            rag_context += f"   参考答案要点：{q['reference_answer']}\n"
                    rag_context += "\n请参考以上题目的风格，结合候选人的实际背景，生成一个考察该维度的面试问题。"
            except Exception as e:
                print(f"RAG search failed: {e}", flush=True)
            end_instruction = (
                f"\n\n当前轮需要考察候选人的【{dimension_name}】能力（权重{current_dimension['weight']}%），"
                f"请根据候选人上一轮的回答，提出一个与该维度相关的问题。"
                f"剩余未考察维度：{[d['name'] for d in remaining[1:]]}"
                f"{rag_context}"
            )
        else:
            end_instruction = "\n\n请根据候选人的回答进行追问或提出下一个问题。"

        messages.append(HumanMessage(content=end_instruction))

        try:
            response = await self.llm.ainvoke(messages)
        except Exception as e:
            print(f"LLM ainvoke failed: {e}", flush=True)
            return {
                "role": "interviewer",
                "content": f"抱歉，AI 服务暂时不可用，请稍后重试。（错误：{str(e)[:100]}）",
                "is_complete": False,
                "round_number": self.round_number,
                "max_rounds": self.max_rounds,
            }
        content = response.content
        self.history.append({"role": "interviewer", "content": content})

        is_complete = False  # 不再自动结束，由用户手动结束面试

        # 标记当前考察的能力维度为已完成
        if current_dimension and self.round_number > 1:
            self.completed_dimensions.add(current_dimension["name"])

        return {
            "role": "interviewer",
            "content": content,
            "is_complete": is_complete,
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
        }

    def get_conversation(self) -> list[dict]:
        return self.history

    def to_dict(self) -> dict:
        """序列化 Agent 状态（不含 LLM 实例）"""
        return {
            "position": self.position,
            "profile": self.profile,
            "ability_model": self.ability_model,
            "weakness_areas": self.weakness_areas,
            "resume_data": self.resume_data,
            "history": self.history,
            "round_number": self.round_number,
            "completed_dimensions": list(self.completed_dimensions),
            "max_rounds": self.max_rounds,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "InterviewAgent":
        """从序列化状态恢复 Agent"""
        agent = cls(
            position=data["position"],
            profile=data["profile"],
            ability_model=data["ability_model"],
            weakness_areas=data["weakness_areas"],
            resume_data=data.get("resume_data"),
        )
        agent.history = data.get("history", [])
        agent.round_number = data.get("round_number", 0)
        agent.completed_dimensions = set(data.get("completed_dimensions", []))
        agent.max_rounds = data.get("max_rounds", 3)
        return agent