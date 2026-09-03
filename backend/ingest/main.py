"""Ingestion pipeline orchestrator."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow running as `python -m ingest.main` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ingest.chunk_and_embed import embed_chunks
from ingest.compute_metrics import apply_risk_flags
from ingest.fetch_filings import fetch_filings
from ingest.fetch_financials import fetch_all_financials
from ingest.load_db import write_processed
from ingest.parse_pdfs import parse_all_filings
from ingest.utils import load_state, repo_root, save_state


def main():
    print("=== Capital Screener Ingestion ===")
    data = fetch_all_financials()
    companies_raw = data["companies"]
    financials = data["financials"]

    filings = fetch_filings(companies_raw)
    companies = apply_risk_flags(companies_raw, financials)

    write_processed(companies, financials, filings)

    chunks = parse_all_filings(filings)
    chunk_count = embed_chunks(chunks)

    state = load_state()
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    state["companies"] = len(companies)
    state["chunks"] = chunk_count
    save_state(state)

    print(f"Done: {len(companies)} companies, {len(financials)} financial rows, {len(filings)} filings, {chunk_count} chunks")


if __name__ == "__main__":
    main()
