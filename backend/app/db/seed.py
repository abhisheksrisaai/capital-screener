"""Seed database and Qdrant from processed JSON artifacts."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import Base, SessionLocal, engine
from app.models.company import Company, Filing, Financial
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def seed_from_processed(db: Session) -> dict:
    processed = settings.data_dir / "processed"
    companies_data = _load_json(processed / "companies.json")
    financials_data = _load_json(processed / "financials.json")
    filings_data = _load_json(processed / "filings.json")

    if not companies_data.get("companies"):
        logger.warning("No processed companies.json found — database will be empty.")
        return {"companies": 0, "financials": 0, "filings": 0, "chunks": 0}

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    company_count = 0
    for row in companies_data["companies"]:
        clean = {k: v for k, v in row.items() if not k.startswith("_") and k in {
            "id", "name", "ticker", "bse_code", "sector",
            "latest_revenue", "revenue_growth_pct", "risk_flag", "data_source",
        }}
        clean.setdefault("data_source", "seed")
        clean["updated_at"] = datetime.now(timezone.utc)
        db.add(Company(**clean))
        company_count += 1

    fin_count = 0
    allowed_fin = {"company_id", "fiscal_year", "revenue", "ebitda", "pat", "debt_to_equity"}
    for row in financials_data.get("financials", []):
        db.add(Financial(**{k: v for k, v in row.items() if k in allowed_fin}))
        fin_count += 1

    fil_count = 0
    allowed_fil = {"company_id", "title", "fiscal_year", "pdf_path", "pdf_hash", "page_count"}
    for row in filings_data.get("filings", []):
        db.add(Filing(**{k: v for k, v in row.items() if k in allowed_fil}))
        fil_count += 1

    db.commit()

    chunk_count = rag_service.load_chunks_from_manifest(processed / "chunks_manifest.json")
    return {
        "companies": company_count,
        "financials": fin_count,
        "filings": fil_count,
        "chunks": chunk_count,
        "seeded": True,
    }


def seed_if_empty() -> dict:
    init_db()
    db = SessionLocal()
    try:
        logger.info("Reseeding database from processed artifacts...")
        return seed_from_processed(db)
    finally:
        db.close()
