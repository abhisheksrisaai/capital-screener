"""Groq LLM service for Q&A and memo generation."""

import logging
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMService:
    def __init__(self) -> None:
        self._client: Any = None

    def _get_client(self):
        if self._client is None and settings.has_groq:
            from groq import Groq
            self._client = Groq(api_key=settings.GROQ_API_KEY)
        return self._client

    def _call(self, system: str, user: str, max_tokens: int = 600) -> str:
        client = self._get_client()
        if client is None:
            return "AI service unavailable. Set GROQ_API_KEY to enable generation."

        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            max_tokens=max_tokens,
        )
        return (response.choices[0].message.content or "").strip()

    def answer_question(self, question: str, sources: List[Dict[str, Any]]) -> str:
        context_blocks = []
        for src in sources:
            context_blocks.append(
                f"[Source: {src.get('doc_title', 'Filing')}, p.{src.get('page', '?')}]\n"
                f"{src.get('excerpt', '')}"
            )
        context = "\n\n".join(context_blocks) or "No filing context available."

        system = (
            "You are an investment research analyst. Answer using ONLY the provided filing excerpts. "
            "Cite sources inline as [Source: title, p.X]. If unknown, say so."
        )
        user = f"Filing excerpts:\n{context}\n\nQuestion: {question}"
        return self._call(system, user)

    def generate_thesis(self, company: Dict[str, Any], sources: List[Dict[str, Any]]) -> str:
        context = "\n".join(s.get("excerpt", "")[:300] for s in sources[:3])
        system = "Write a concise 3-4 sentence investment thesis for an internal memo. Be factual."
        user = (
            f"Company: {company.get('name')} ({company.get('sector')})\n"
            f"Revenue: {company.get('latest_revenue')} Cr, Growth: {company.get('revenue_growth_pct')}%\n"
            f"Risk: {company.get('risk_flag')}\n"
            f"Filing context:\n{context}"
        )
        return self._call(system, user, max_tokens=250)

    def summarize_risks(self, company: Dict[str, Any], sources: List[Dict[str, Any]]) -> str:
        context = "\n".join(s.get("excerpt", "")[:300] for s in sources[:4])
        system = "List 2-3 key investment risks as bullet points based on filings and KPIs."
        user = (
            f"Company risk flag: {company.get('risk_flag')}\n"
            f"Growth: {company.get('revenue_growth_pct')}%\n"
            f"Filing excerpts:\n{context}"
        )
        return self._call(system, user, max_tokens=200)


llm_service = LLMService()
