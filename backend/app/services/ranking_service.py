"""Transparent company ranking."""

from typing import Any, Dict, List

RISK_MULTIPLIER = {"LOW": 1.0, "MEDIUM": 0.6, "HIGH": 0.2}


def _normalize(value: float, min_val: float, max_val: float) -> float:
    if max_val <= min_val:
        return 0.5
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def rank_companies(companies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not companies:
        return []

    revenues = [c["latest_revenue"] for c in companies]
    growths = [c["revenue_growth_pct"] for c in companies]
    rev_min, rev_max = min(revenues), max(revenues)
    gr_min, gr_max = min(growths), max(growths)

    ranked = []
    for company in companies:
        growth_norm = _normalize(company["revenue_growth_pct"], gr_min, gr_max)
        scale_norm = _normalize(company["latest_revenue"], rev_min, rev_max)
        risk_mult = RISK_MULTIPLIER.get(company.get("risk_flag", "MEDIUM"), 0.6)

        growth_contrib = 0.40 * growth_norm
        scale_contrib = 0.30 * scale_norm
        risk_contrib = 0.30 * risk_mult
        score = round((growth_contrib + scale_contrib + risk_contrib) * 100, 2)

        ranked.append(
            {
                **company,
                "score": score,
                "breakdown": {
                    "growth_contrib": round(growth_contrib * 100, 2),
                    "scale_contrib": round(scale_contrib * 100, 2),
                    "risk_contrib": round(risk_contrib * 100, 2),
                },
            }
        )

    ranked.sort(key=lambda x: x["score"], reverse=True)
    for i, item in enumerate(ranked, start=1):
        item["rank"] = i
    return ranked
