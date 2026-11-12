"""Analytics routes: universe overview and grounded Q&A."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.company import Company, Filing, Financial
from app.services import analytics_service
from app.services.llm_service import llm_service
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2000)


class AnalyticsAskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=500)
    company_id: Optional[str] = None
    history: List[ChatMessage] = Field(default_factory=list)


def _load_overview(db: Session) -> dict:
    companies = [
        {
            "id": company.id,
            "name": company.name,
            "ticker": company.ticker,
            "bse_code": company.bse_code,
            "sector": company.sector,
            "latest_revenue": company.latest_revenue,
            "revenue_growth_pct": company.revenue_growth_pct,
            "risk_flag": company.risk_flag,
            "data_source": company.data_source,
        }
        for company in db.query(Company).all()
    ]
    financials = [
        {
            "company_id": row.company_id,
            "fiscal_year": row.fiscal_year,
            "revenue": row.revenue,
            "ebitda": row.ebitda,
            "pat": row.pat,
            "debt_to_equity": row.debt_to_equity,
        }
        for row in db.query(Financial).all()
    ]
    filings = [
        {
            "company_id": row.company_id,
            "title": row.title,
            "fiscal_year": row.fiscal_year,
            "page_count": row.page_count,
        }
        for row in db.query(Filing).all()
    ]
    return analytics_service.build_overview(
        companies,
        financials,
        filings,
        chunks=analytics_service.chunk_stats(),
        refreshed_at=analytics_service.last_refresh(),
    )


@router.get("/overview")
def analytics_overview(db: Session = Depends(get_db)):
    """One payload for the overview, screener, data room, and chat context."""
    return _load_overview(db)


@router.get("/coverage")
def analytics_coverage(db: Session = Depends(get_db)):
    """Coverage and provenance slice for the data room."""
    overview = _load_overview(db)
    return {
        "coverage": overview["coverage"],
        "datasets": overview["datasets"],
        "provenance": overview["provenance"],
        "kpis": overview["kpis"],
        "meta": overview["meta"],
    }


@router.post("/ask")
def ask_analytics(body: AnalyticsAskRequest, db: Session = Depends(get_db)):
    """Answer a universe question from computed facts, then optional LLM polish."""
    overview = _load_overview(db)

    if body.company_id and not any(
        company["id"] == body.company_id for company in overview["companies"]
    ):
        raise HTTPException(status_code=404, detail="Company not found")

    question = body.question.strip()
    scoped_company_id = body.company_id or analytics_service.resolve_company_id(
        question, overview
    )
    filing_hits = []
    wants_filings = bool(scoped_company_id) or any(
        term in question.lower() for term in analytics_service.FILING_TERMS
    )
    if wants_filings:
        lower = question.lower()
        search_query = question
        if any(term in lower for term in ("risk", "litigation", "governance")):
            search_query = f"{question} key business risks material risks"
        keyword_hits = analytics_service.keyword_filing_hits(
            scoped_company_id, question, top_k=6
        )
        if keyword_hits and keyword_hits[0]["score"] >= 4:
            filing_hits = keyword_hits[:4]
        else:
            try:
                hits = rag_service.search_all(
                    search_query, top_k=12, company_id=scoped_company_id
                )
                filing_hits = analytics_service.rank_filing_hits(hits, question)[:4]
            except Exception as exc:  # retrieval should never break a numeric answer
                logger.warning("Filing retrieval unavailable: %s", exc)

    result = analytics_service.answer_question(
        question,
        overview,
        history=[message.model_dump() for message in body.history],
        company_id=scoped_company_id,
        filing_hits=filing_hits,
    )

    if settings.has_groq and result["intent"] != "abstain":
        try:
            polished = llm_service.answer_analytics(
                question,
                result["answer"],
                result["facts"],
                filing_hits=filing_hits,
                history=[message.model_dump() for message in body.history],
            )
            if polished and not polished.startswith("AI service unavailable"):
                result["answer"] = polished
                result["meta"]["engine"] = "groq"
        except Exception as exc:
            logger.warning("Groq analytics narrative unavailable: %s", exc)

    return result
