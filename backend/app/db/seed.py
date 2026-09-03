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

    company_count = 0
    for row in companies_data["companies"]:
        existing = db.get(Company, row["id"])
        clean = {k: v for k, v in row.items() if not k.startswith("_")}
        if existing:
            for key in ("name", "ticker", "bse_code", "sector", "latest_revenue", "revenue_growth_pct", "risk_flag"):
                setattr(existing, key, clean[key])
            existing.updated_at = datetime.now(timezone.utc)
        else:
            db.add(Company(**clean))
        company_count += 1

    db.query(Financial).delete()
    fin_count = 0
    for row in financials_data.get("financials", []):
        db.add(Financial(**row))
        fin_count += 1

    db.query(Filing).delete()
    fil_count = 0
    for row in filings_data.get("filings", []):
        db.add(Filing(**row))
        fil_count += 1

    db.commit()

    chunk_count = rag_service.load_chunks_from_manifest(processed / "chunks_manifest.json")
    return {
        "companies": company_count,
        "financials": fin_count,
        "filings": fil_count,
        "chunks": chunk_count,
    }


def seed_if_empty() -> dict:
    init_db()
    db = SessionLocal()
    try:
        count = db.query(Company).count()
        if count == 0:
            logger.info("Database empty — seeding from processed artifacts...")
            return seed_from_processed(db)
        chunk_count = rag_service.count_chunks()
        if chunk_count == 0:
            manifest = settings.data_dir / "processed" / "chunks_manifest.json"
            chunk_count = rag_service.load_chunks_from_manifest(manifest)
        return {"companies": count, "chunks": chunk_count, "seeded": False}
    finally:
        db.close()
