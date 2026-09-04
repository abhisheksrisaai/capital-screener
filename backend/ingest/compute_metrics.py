"""Compute risk flags from financial metrics."""

from typing import Any, Dict, List


def compute_risk_flag(company: Dict[str, Any], financials: List[Dict[str, Any]]) -> str:
    growth = company.get("revenue_growth_pct", 0)
    company_fin = sorted(
        [f for f in financials if f["company_id"] == company["id"]],
        key=lambda x: x["fiscal_year"],
    )
    latest_de = company_fin[-1].get("debt_to_equity", 0) if company_fin else 0

    margin_declines = 0
    for i in range(1, len(company_fin)):
        prev = company_fin[i - 1]
        curr = company_fin[i]
        prev_margin = (prev["pat"] / prev["revenue"]) if prev["revenue"] else 0
        curr_margin = (curr["pat"] / curr["revenue"]) if curr["revenue"] else 0
        if curr_margin < prev_margin:
            margin_declines += 1
        else:
            margin_declines = 0

    if growth < 0 or latest_de > 2.0 or margin_declines >= 2:
        return "HIGH"
    if 0 <= growth <= 5 or latest_de >= 1.0:
        return "MEDIUM"
    if growth > 5 and latest_de < 1.0:
        return "LOW"
    return "MEDIUM"


def apply_risk_flags(companies: List[Dict[str, Any]], financials: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for company in companies:
        company["risk_flag"] = compute_risk_flag(company, financials)
        if not company.get("data_source"):
            company["data_source"] = "seed" if company.pop("_seed_mode", False) else "real"
        for key in ("_financials", "_annual_reports", "_seed_mode"):
            company.pop(key, None)
    return companies
