"""Shared ingestion utilities."""

import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup

USER_AGENT = "CapitalScreener/1.0 (research-tool; contact@example.com)"
REQUEST_DELAY = 1.5


def repo_root() -> Path:
    from app.core.config import settings
    return settings.data_dir.parent if settings.DATA_DIR else Path(__file__).resolve().parents[2]


def load_universe() -> List[Dict[str, Any]]:
    path = repo_root() / "data" / "config" / "universe.json"
    return json.loads(path.read_text(encoding="utf-8"))["companies"]


def load_state() -> Dict[str, Any]:
    path = repo_root() / "data" / "processed" / "ingestion_state.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"pdf_hashes": {}, "last_run": None}


def save_state(state: Dict[str, Any]) -> None:
    path = repo_root() / "data" / "processed" / "ingestion_state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_html(url: str) -> Optional[str]:
    try:
        time.sleep(REQUEST_DELAY)
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        resp.raise_for_status()
        return resp.text
    except Exception as exc:
        print(f"  fetch failed {url}: {exc}")
        return None


def parse_number(text: str) -> float:
    if not text:
        return 0.0
    cleaned = text.replace(",", "").replace("₹", "").replace("%", "").strip()
    if cleaned in ("-", "", "—"):
        return 0.0
    multiplier = 1.0
    if cleaned.endswith("Cr"):
        multiplier = 1.0
        cleaned = cleaned.replace("Cr", "").strip()
    elif cleaned.endswith("L"):
        multiplier = 0.01
        cleaned = cleaned.replace("L", "").strip()
    try:
        return float(cleaned) * multiplier
    except ValueError:
        return 0.0


def parse_screener_financials(slug: str) -> Dict[str, Any]:
    """Scrape annual P&L and ratios from Screener.in."""
    url = f"https://www.screener.in/company/{slug}/"
    html = fetch_html(url)
    if not html:
        return {"sector": "", "financials": [], "annual_reports": []}

    soup = BeautifulSoup(html, "html.parser")
    sector = ""
    sector_el = soup.select_one("a[href*='/market/']")
    if sector_el:
        sector = sector_el.get_text(strip=True)

    financials: List[Dict[str, Any]] = []
    table = soup.find("section", id="profit-loss")
    if table:
        rows = table.select("table tr")
        headers = [th.get_text(strip=True) for th in rows[0].find_all("th")]
        years = [h for h in headers if re.match(r"Mar \d{4}", h)]

        data_rows = {}
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            label = cells[0].get_text(strip=True).lower()
            data_rows[label] = {
                years[i]: parse_number(cells[i + 1].get_text(strip=True))
                for i in range(min(len(years), len(cells) - 1))
            }

        for year in years[-5:]:
            fin_year = year.replace("Mar ", "FY")
            revenue = data_rows.get("sales", {}).get(year, 0) or data_rows.get("revenue", {}).get(year, 0)
            pat = data_rows.get("net profit", {}).get(year, 0) or data_rows.get("pat", {}).get(year, 0)
            ebitda = data_rows.get("operating profit", {}).get(year, 0) or data_rows.get("ebitda", {}).get(year, 0)
            financials.append(
                {
                    "fiscal_year": fin_year,
                    "revenue": revenue,
                    "pat": pat,
                    "ebitda": ebitda,
                    "debt_to_equity": 0.0,
                }
            )

    ratios_section = soup.find("section", id="ratios")
    if ratios_section and financials:
        ratio_rows = ratios_section.select("table tr")
        de_row = None
        for row in ratio_rows:
            if "debt to equity" in row.get_text(strip=True).lower():
                de_row = row
                break
        if de_row:
            cells = de_row.find_all("td")
            headers_row = ratios_section.select("table tr")[0]
            years = [th.get_text(strip=True) for th in headers_row.find_all("th") if re.match(r"Mar \d{4}", th.get_text(strip=True))]
            for i, year in enumerate(years[-5:]):
                fy = year.replace("Mar ", "FY")
                for fin in financials:
                    if fin["fiscal_year"] == fy and i + 1 < len(cells):
                        fin["debt_to_equity"] = parse_number(cells[i + 1].get_text(strip=True))

    annual_reports = []
    docs = soup.find("section", id="documents") or soup.find("div", id="documents")
    if docs:
        for link in docs.select("a[href$='.pdf'], a[href*='.pdf']"):
            href = link.get("href", "")
            title = link.get_text(strip=True) or "Annual Report"
            if "annual" in title.lower() or "report" in title.lower():
                if href.startswith("/"):
                    href = f"https://www.screener.in{href}"
                annual_reports.append({"title": title, "url": href})

    return {"sector": sector, "financials": financials, "annual_reports": annual_reports[:3]}
