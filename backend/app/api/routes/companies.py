"""FastAPI routes for companies, ranking, Q&A, and memos."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.company import Company, Filing, Financial
from app.services.llm_service import llm_service
from app.services.ranking_service import rank_companies
from app.services.rag_service import rag_service
from app.services.report_generator import memo_generator

router = APIRouter(prefix="/api")


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)


def _company_dict(c: Company) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "ticker": c.ticker,
        "bse_code": c.bse_code,
        "sector": c.sector,
        "latest_revenue": c.latest_revenue,
        "revenue_growth_pct": c.revenue_growth_pct,
        "risk_flag": c.risk_flag,
    }


@router.get("/health")
def health(db: Session = Depends(get_db)):
    company_count = db.query(Company).count()
    chunk_count = rag_service.count_chunks()
    return {
        "status": "ok",
        "companies": company_count,
        "qdrant_chunks": chunk_count,
        "groq_configured": bool(llm_service._get_client()),
    }


@router.get("/companies")
def list_companies(
    sector: Optional[str] = None,
    min_revenue: Optional[float] = None,
    max_revenue: Optional[float] = None,
    min_growth: Optional[float] = None,
    max_growth: Optional[float] = None,
    risk_flag: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Company)
    if sector:
        query = query.filter(Company.sector == sector)
    if min_revenue is not None:
        query = query.filter(Company.latest_revenue >= min_revenue)
    if max_revenue is not None:
        query = query.filter(Company.latest_revenue <= max_revenue)
    if min_growth is not None:
        query = query.filter(Company.revenue_growth_pct >= min_growth)
    if max_growth is not None:
        query = query.filter(Company.revenue_growth_pct <= max_growth)
    if risk_flag:
        query = query.filter(Company.risk_flag == risk_flag.upper())

    companies = [_company_dict(c) for c in query.all()]
    return {"companies": companies, "count": len(companies)}


@router.get("/companies/sectors")
def list_sectors(db: Session = Depends(get_db)):
    rows = db.query(Company.sector).distinct().all()
    return {"sectors": sorted(r[0] for r in rows if r[0])}


@router.get("/companies/{company_id}")
def get_company(company_id: str, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    filings = [
        {
            "id": f.id,
            "title": f.title,
            "fiscal_year": f.fiscal_year,
            "page_count": f.page_count,
        }
        for f in db.query(Filing).filter(Filing.company_id == company_id).all()
    ]
    return {**_company_dict(company), "filings": filings}


@router.get("/companies/{company_id}/financials")
def get_financials(company_id: str, db: Session = Depends(get_db)):
    if not db.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Company not found")

    rows = (
        db.query(Financial)
        .filter(Financial.company_id == company_id)
        .order_by(Financial.fiscal_year)
        .all()
    )
    return {
        "financials": [
            {
                "fiscal_year": r.fiscal_year,
                "revenue": r.revenue,
                "ebitda": r.ebitda,
                "pat": r.pat,
                "debt_to_equity": r.debt_to_equity,
                "pat_margin": round((r.pat / r.revenue * 100) if r.revenue else 0, 2),
            }
            for r in rows
        ]
    }


@router.get("/ranking")
def get_ranking(db: Session = Depends(get_db)):
    companies = [_company_dict(c) for c in db.query(Company).all()]
    return {"ranking": rank_companies(companies)}


@router.post("/companies/{company_id}/ask")
def ask_company(company_id: str, body: AskRequest, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    sources = rag_service.search(company_id, body.question, top_k=5)
    if not sources:
        return {
            "answer": "No filing data indexed for this company yet. Run the ingestion pipeline.",
            "sources": [],
        }

    answer = llm_service.answer_question(body.question, sources)
    return {"answer": answer, "sources": sources}


@router.post("/companies/{company_id}/memo")
def generate_memo(company_id: str, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    company_dict = _company_dict(company)
    ranked = rank_companies([company_dict])
    score = ranked[0]["score"] if ranked else 0

    sources = rag_service.search(company_id, "business risks growth strategy financial outlook", top_k=4)
    thesis = llm_service.generate_thesis(company_dict, sources)
    risks = llm_service.summarize_risks(company_dict, sources)

    pdf_bytes = memo_generator.generate_memo(
        {
            "company": company_dict,
            "score": score,
            "thesis": thesis,
            "risks": risks,
        }
    )

    filename = f"{company_id}_memo.pdf"
    media_type = "application/pdf" if pdf_bytes[:4] == b"%PDF" else "text/html"
    ext = "pdf" if media_type == "application/pdf" else "html"
    return Response(
        content=pdf_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{company_id}_memo.{ext}"'},
    )
