"""Fetch financial data from Screener.in with seed fallback."""

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
        "_seed_mode": True,
    }


def fetch_all_financials() -> Dict[str, Any]:
    companies_out = []
    financials_out = []

    for company in load_universe():
        print(f"Fetching financials: {company['name']}")
        data = parse_screener_financials(company["screener_slug"])

        if data.get("financials"):
            sector = data.get("sector") or company.get("sector", "")
            financials = data["financials"]
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
                "latest_revenue": revenue,
                "revenue_growth_pct": growth,
                "risk_flag": "MEDIUM",
                "_financials": financials,
                "_annual_reports": data.get("annual_reports", []),
            }
        else:
            print(f"  Using seed profile for {company['id']} (scrape unavailable)")
            row = _fallback_company(company)

        companies_out.append(row)
        for fin in row["_financials"]:
            financials_out.append({"company_id": company["id"], **fin})

    return {"companies": companies_out, "financials": financials_out}
