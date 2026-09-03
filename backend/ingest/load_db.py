"""Write processed JSON artifacts for seeding."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from ingest.utils import repo_root, save_state


def write_processed(
    companies: List[Dict[str, Any]],
    financials: List[Dict[str, Any]],
    filings: List[Dict[str, Any]],
) -> None:
    processed = repo_root() / "data" / "processed"
    processed.mkdir(parents=True, exist_ok=True)

    (processed / "companies.json").write_text(
        json.dumps({"companies": companies}, indent=2), encoding="utf-8"
    )
    (processed / "financials.json").write_text(
        json.dumps({"financials": financials}, indent=2), encoding="utf-8"
    )
    (processed / "filings.json").write_text(
        json.dumps({"filings": filings}, indent=2), encoding="utf-8"
    )

    state = {"pdf_hashes": {}, "last_run": datetime.now(timezone.utc).isoformat()}
    save_state(state)
