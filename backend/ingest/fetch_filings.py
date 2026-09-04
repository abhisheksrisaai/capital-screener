"""Download annual report PDFs or create seed text filings."""

import time
from pathlib import Path
from typing import Any, Dict, List

import requests

from ingest.utils import USER_AGENT, clean_doc_title, extract_fiscal_year, load_state, repo_root, sha256_file


def download_pdf(url: str, dest: Path) -> bool:
    if url.startswith("seed://"):
        return False
    try:
        time.sleep(1.5)
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
        resp.raise_for_status()
        if "pdf" not in resp.headers.get("content-type", "").lower() and not url.endswith(".pdf"):
            if not resp.content[:4] == b"%PDF":
                return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)
        return True
    except Exception as exc:
        print(f"  PDF download failed: {exc}")
        return False


def _write_seed_pdf(company_id: str, fiscal_year: str, text: str) -> Path:
    """Create a minimal text-based PDF placeholder using PyMuPDF."""
    import fitz

    raw_dir = repo_root() / "data" / "raw" / company_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    dest = raw_dir / f"{company_id}_{fiscal_year}.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), text, fontsize=10)
    doc.save(str(dest))
    doc.close()
    return dest


def fetch_filings(companies_with_reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    state = load_state()
    filings_out: List[Dict[str, Any]] = []
    raw_dir = repo_root() / "data" / "raw"

    for company in companies_with_reports:
        reports = company.get("_annual_reports", [])
        for i, report in enumerate(reports):
            url = report.get("url", "")
            fallback_year = report.get("fiscal_year") or f"FY{2024 - i}"
            title = clean_doc_title(report.get("title", f"Annual Report {fallback_year}"))
            fiscal_year = extract_fiscal_year(title, fallback_year)

            filename = f"{company['id']}_{fiscal_year}.pdf"
            dest = raw_dir / company["id"] / filename

            if url.startswith("seed://") or report.get("_seed_text"):
                if not dest.exists():
                    print(f"  Creating seed filing: {dest.name}")
                    dest = _write_seed_pdf(company["id"], fiscal_year, report.get("_seed_text", ""))
            elif not dest.exists():
                print(f"  Downloading {company['id']}: {report.get('title', url)}")
                if not download_pdf(url, dest):
                    continue

            if not dest.exists():
                continue

            pdf_hash = sha256_file(dest)
            state["pdf_hashes"][str(dest)] = pdf_hash
            page_count = 0
            try:
                import fitz
                with fitz.open(str(dest)) as doc:
                    page_count = doc.page_count
            except Exception:
                pass

            filings_out.append(
                {
                    "company_id": company["id"],
                    "title": title,
                    "fiscal_year": fiscal_year,
                    "pdf_path": str(dest.relative_to(repo_root())),
                    "pdf_hash": pdf_hash,
                    "page_count": page_count,
                }
            )

        if not any(f["company_id"] == company["id"] for f in filings_out):
            from ingest.seed_profiles import build_filing_text

            for fy in ("FY2024", "FY2023"):
                text = build_filing_text(company, fy)
                dest = _write_seed_pdf(company["id"], fy, text)
                filings_out.append(
                    {
                        "company_id": company["id"],
                        "title": f"Annual Report {fy}",
                        "fiscal_year": fy,
                        "pdf_path": str(dest.relative_to(repo_root())),
                        "pdf_hash": sha256_file(dest),
                        "page_count": 1,
                    }
                )

    from ingest.utils import save_state
    save_state(state)
    return filings_out
