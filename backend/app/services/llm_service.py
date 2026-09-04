"""Groq LLM service for Q&A and memo generation."""

import logging
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

FALLBACK_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "openai/gpt-oss-20b",
]


def _sanitize(text: str, limit: int = 800) -> str:
    cleaned = (text or "").encode("utf-8", errors="replace").decode("utf-8")
    return cleaned[:limit]


class LLMService:
    def __init__(self) -> None:
        self._client: Any = None

    def _get_client(self):
        if self._client is None and settings.has_groq:
            from groq import Groq
            self._client = Groq(api_key=settings.GROQ_API_KEY)
        return self._client

    def _models(self) -> List[str]:
        preferred = (settings.GROQ_MODEL or "").strip()
        ordered = [preferred] + [m for m in FALLBACK_MODELS if m != preferred]
        return [m for m in ordered if m]

    def _call(self, system: str, user: str, max_tokens: int = 600) -> str:
        client = self._get_client()
        if client is None:
            return "AI service unavailable. Set GROQ_API_KEY to enable generation."

        last_error: Optional[Exception] = None
        for model in self._models():
            try:
                kwargs: Dict[str, Any] = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": 0.2,
                }
                try:
                    response = client.chat.completions.create(
                        **kwargs, max_tokens=max_tokens
                    )
                except TypeError:
                    response = client.chat.completions.create(
                        **kwargs, max_completion_tokens=max_tokens
                    )
                text = (response.choices[0].message.content or "").strip()
                if text:
                    return text
            except Exception as exc:
                last_error = exc
                logger.warning("Groq model %s failed: %s", model, exc)
                continue

        logger.error("All Groq models failed: %s", last_error)
        raise RuntimeError(f"AI generation failed: {last_error}")

    def answer_question(self, question: str, sources: List[Dict[str, Any]]) -> str:
        context_blocks = []
        for src in sources[:4]:
            context_blocks.append(
                f"[Source: {_sanitize(str(src.get('doc_title', 'Filing')), 80)}, p.{src.get('page', '?')}]\n"
                f"{_sanitize(str(src.get('excerpt', '')), 1800)}"
            )
        context = "\n\n".join(context_blocks) or "No filing context available."

        system = (
            "You are an investment research analyst. Answer using ONLY the provided filing excerpts. "
            "Cite sources inline as [Source: title, p.X]. If unknown, say so. Keep the answer under 180 words."
        )
        user = f"Filing excerpts:\n{context}\n\nQuestion: {_sanitize(question, 400)}"
        return self._call(system, user, max_tokens=400)

    def generate_thesis(self, company: Dict[str, Any], sources: List[Dict[str, Any]]) -> str:
        context = "\n".join(_sanitize(str(s.get("excerpt", "")), 800) for s in sources[:3])
        system = "Write a concise 3-4 sentence investment thesis for an internal memo. Be factual."
        user = (
            f"Company: {company.get('name')} ({company.get('sector')})\n"
            f"Revenue: {company.get('latest_revenue')} Cr, Growth: {company.get('revenue_growth_pct')}%\n"
            f"Risk: {company.get('risk_flag')}\n"
            f"Filing context:\n{context}"
        )
        return self._call(system, user, max_tokens=250)

    def summarize_risks(self, company: Dict[str, Any], sources: List[Dict[str, Any]]) -> str:
        context = "\n".join(_sanitize(str(s.get("excerpt", "")), 800) for s in sources[:4])
        system = "List 2-3 key investment risks as bullet points based on filings and KPIs."
        user = (
            f"Company risk flag: {company.get('risk_flag')}\n"
            f"Growth: {company.get('revenue_growth_pct')}%\n"
            f"Filing excerpts:\n{context}"
        )
        return self._call(system, user, max_tokens=200)


llm_service = LLMService()
