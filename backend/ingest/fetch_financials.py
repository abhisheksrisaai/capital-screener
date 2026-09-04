"""Fetch financial data from Screener.in with seed fallback."""

import os
from typing import Any, Dict, List

from ingest.seed_profiles import PROFILES, build_financials, build_filing_text
from ingest.utils import load_universe, parse_screener_financials


def _fallback_company(company: Dict[str, Any]) -> Dict[str, Any]:
    profile = PROFILES.get(company["id"], {"base_revenue": 100, "growth": 5, "de_ratio": 0.8, "margin": 0.08})
    financials = build_financials(company["id"], profile)
    latest = financials[-1]
    prev = financials[-2]
    growth = round(((latest["revenue"] - prev["revenue"]) / prev["revenue"] * 100) if prev["revenue"] else profile["growth"], 2)

    annual_reports = [
        {
            "title": f"Annual Report {financials[-1]['fiscal_year']}",
            "url": f"seed://{company['id']}/{financials[-1]['fiscal_year']}",
            "_seed_text": build_filing_text(company, financials[-1]["fiscal_year"]),
        },
        {
            "title": f"Annual Report {financials[-2]['fiscal_year']}",
            "url": f"seed://{company['id']}/{financials[-2]['fiscal_year']}",
            "_seed_text": build_filing_text(company, financials[-2]["fiscal_year"]),
        },
    ]

    return {
        "id": company["id"],
        "name": company["name"],
        "ticker": company["screener_slug"],
        "bse_code": company["bse_code"],
        "sector": company.get("sector", ""),
        "latest_revenue": latest["revenue"],
        "revenue_growth_pct": growth,
        "risk_flag": "MEDIUM",
        "_financials": financials,
        "_annual_reports": annual_reports,
        "data_source": "seed",
    }


def fetch_all_financials() -> Dict[str, Any]:
    companies_out = []
    financials_out = []

    for company in load_universe():
        print(f"Fetching financials: {company['name']}")
        if os.environ.get("SKIP_SCRAPE") == "1":
            print(f"  SKIP_SCRAPE=1 — using seed profile for {company['id']}")
            row = _fallback_company(company)
        else:
            data = parse_screener_financials(company["screener_slug"])

            scraped = bool(data.get("financials"))
            financials = data.get("financials") or []
            latest_rev = financials[-1].get("revenue", 0) if financials else 0
            if not scraped or latest_rev <= 0:
                print(f"  Using seed profile for {company['id']} (scrape unavailable or zero revenue)")
                row = _fallback_company(company)
                if data.get("annual_reports"):
                    row["_annual_reports"] = data["annual_reports"] + row["_annual_reports"]
                    row["data_source"] = "hybrid"
            else:
                sector = data.get("sector") or company.get("sector", "")
                latest = financials[-1]
                prev = financials[-2] if len(financials) >= 2 else {}
                revenue = latest.get("revenue", 0)
                prev_rev = prev.get("revenue", 0)
                growth = round(((revenue - prev_rev) / prev_rev * 100) if prev_rev else 0, 2)
                row = {
                    "id": company["id"],
                    "name": company["name"],
                    "ticker": company["screener_slug"],
                    "bse_code": company["bse_code"],
                    "sector": sector,
                    "latest_revenue": round(revenue, 2),
                    "revenue_growth_pct": growth,
                    "risk_flag": "MEDIUM",
                    "data_source": "real",
                    "_financials": financials,
                    "_annual_reports": data.get("annual_reports", []),
                }

        companies_out.append(row)
        for fin in row["_financials"]:
            financials_out.append({"company_id": company["id"], **fin})

    return {"companies": companies_out, "financials": financials_out}
