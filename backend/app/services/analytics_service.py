"""Universe-level analytics, derived datasets, and grounded Q&A.

Everything returned here is computed from the committed artifacts that seed
SQLite: companies, financial statements, filings, and the retrieval manifest.
The chat layer answers from those numbers first and only uses an LLM to
rewrite the narrative when a Groq key is configured.
"""

from __future__ import annotations

import json
import logging
import math
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services.ranking_service import rank_companies

logger = logging.getLogger(__name__)

RISK_ORDER = ("LOW", "MEDIUM", "HIGH")

DEFAULT_SUGGESTIONS = [
    "Which companies grew fastest?",
    "Where is risk concentrated?",
    "Compare Macpower and Krishna Defence",
    "How did PAT margins trend?",
]

UNSUPPORTED_TERMS = (
    "share price",
    "stock price",
    "market cap",
    "valuation",
    "p/e",
    "pe ratio",
    "target price",
    "buy or sell",
    "should i buy",
    "should i sell",
    "recommend",
    "dividend",
    "news",
    "headline",
    "promoter holding",
    "insider",
)

FILING_TERMS = (
    "filing",
    "annual report",
    "strategy",
    "outlook",
    "management",
    "governance",
    "litigation",
    "business model",
    "md&a",
    "risk",
)

SECTOR_ALIASES = {
    "Industrials": ("industrials", "industrial", "manufacturing", "capital goods"),
    "Commodities": ("commodities", "commodity"),
    "Consumer Discretionary": (
        "consumer discretionary",
        "consumer",
        "discretionary",
    ),
    "Information Technology": (
        "information technology",
        "it sector",
        "technology sector",
        "software",
    ),
    "Steel / Metals": ("steel", "metals", "metal"),
    "Chemicals": ("chemicals", "chemical"),
}

_CHUNK_CACHE: Dict[str, Any] = {
    "key": None,
    "by_company": {},
    "total": 0,
    "rows": [],
}

NOISE_HEADINGS = (
    "notes forming part",
    "related party",
    "independent auditor",
    "balance sheet",
    "statement of cash",
    "accounting policies",
    "notes to the financial",
    "we have audited",
    "audit in accordance",
    "basis for opinion",
    "our opinion",
)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _round(value: Any, digits: int = 2) -> float:
    return round(_num(value), digits)


def _pct(part: float, whole: float) -> float:
    return (part / whole * 100.0) if whole else 0.0


def _fy_number(fiscal_year: Any) -> int:
    match = re.search(r"(\d{4})", str(fiscal_year or ""))
    return int(match.group(1)) if match else 0


def _median(values: List[float]) -> float:
    clean = [v for v in values if v is not None]
    return statistics.median(clean) if clean else 0.0


def _cr(value: float) -> str:
    return f"₹{value:,.0f} Cr"


def _pct_text(value: float) -> str:
    return f"{value:+.1f}%"


def _plain_pct(value: float) -> str:
    return f"{value:.1f}%"


def _ratio(value: float) -> str:
    return f"{value:.2f}"


def _join_names(names: List[str]) -> str:
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])}, and {names[-1]}"


# ---------------------------------------------------------------------------
# Artifact helpers
# ---------------------------------------------------------------------------


def chunk_stats() -> Dict[str, Any]:
    """Read chunk counts once per manifest change."""
    path = settings.processed_dir / "chunks_manifest.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {"by_company": {}, "total": 0}

    key = (str(path), mtime)
    if _CHUNK_CACHE["key"] == key:
        return {
            "by_company": dict(_CHUNK_CACHE["by_company"]),
            "total": _CHUNK_CACHE["total"],
        }

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        chunks = data.get("chunks", [])
        counts = Counter(c.get("company_id") for c in chunks if c.get("company_id"))
        _CHUNK_CACHE.update(
            {
                "key": key,
                "by_company": dict(counts),
                "total": len(chunks),
                "rows": chunks,
            }
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Could not read chunk manifest: %s", exc)

    return {
        "by_company": dict(_CHUNK_CACHE["by_company"]),
        "total": _CHUNK_CACHE["total"],
    }


def chunk_rows() -> List[Dict[str, Any]]:
    chunk_stats()
    return _CHUNK_CACHE.get("rows", [])


def last_refresh() -> Optional[str]:
    path = settings.processed_dir / "ingestion_state.json"
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("last_run")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Derived company / sector / series datasets
# ---------------------------------------------------------------------------


def _history_by_company(financials: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in financials:
        company_id = row.get("company_id")
        if company_id:
            history[company_id].append(row)
    for rows in history.values():
        rows.sort(key=lambda row: _fy_number(row.get("fiscal_year")))
    return history


def _company_records(
    companies: List[Dict[str, Any]], financials: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    history = _history_by_company(financials)
    records: List[Dict[str, Any]] = []

    for company in companies:
        rows = history.get(company.get("id"), [])
        latest = rows[-1] if rows else {}
        previous = rows[-2] if len(rows) > 1 else None
        latest_revenue = _num(latest.get("revenue"), _num(company.get("latest_revenue")))
        latest_pat = _num(latest.get("pat"))
        latest_ebitda = _num(latest.get("ebitda"))
        latest_debt = _num(latest.get("debt_to_equity"))
        prior_revenue = _num(previous.get("revenue")) if previous else 0.0

        growth = company.get("revenue_growth_pct")
        if growth is None and prior_revenue:
            growth = _pct(latest_revenue - prior_revenue, prior_revenue)

        company_history = [
            {
                "fiscal_year": row.get("fiscal_year"),
                "revenue": _round(row.get("revenue"), 1),
                "ebitda": _round(row.get("ebitda"), 1),
                "pat": _round(row.get("pat"), 1),
                "debt_to_equity": _round(row.get("debt_to_equity"), 2),
                "pat_margin": _round(
                    _pct(_num(row.get("pat")), _num(row.get("revenue"))), 2
                ),
                "ebitda_margin": _round(
                    _pct(_num(row.get("ebitda")), _num(row.get("revenue"))), 2
                ),
            }
            for row in rows
        ]

        records.append(
            {
                "id": company.get("id"),
                "name": company.get("name"),
                "ticker": company.get("ticker"),
                "bse_code": company.get("bse_code"),
                "sector": company.get("sector") or "Unclassified",
                "risk_flag": company.get("risk_flag") or "MEDIUM",
                "data_source": company.get("data_source") or "seed",
                "latest_year": latest.get("fiscal_year") or "",
                "latest_revenue": _round(latest_revenue, 1),
                "latest_pat": _round(latest_pat, 1),
                "latest_ebitda": _round(latest_ebitda, 1),
                "latest_debt_to_equity": _round(latest_debt, 2),
                "prior_revenue": _round(prior_revenue, 1),
                "revenue_growth_pct": _round(growth, 2),
                "pat_margin": _round(_pct(latest_pat, latest_revenue), 2),
                "ebitda_margin": _round(_pct(latest_ebitda, latest_revenue), 2),
                "history": company_history,
            }
        )

    return _attach_ranking(records)


def _attach_ranking(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ranked = rank_companies(
        [
            {
                "id": record["id"],
                "latest_revenue": record["latest_revenue"],
                "revenue_growth_pct": record["revenue_growth_pct"],
                "risk_flag": record["risk_flag"],
            }
            for record in records
        ]
    )
    by_id = {item["id"]: item for item in ranked}
    for record in records:
        scored = by_id.get(record["id"], {})
        record["score"] = scored.get("score", 0.0)
        record["rank"] = scored.get("rank", 0)
        record["score_breakdown"] = scored.get("breakdown", {})
    records.sort(key=lambda record: record["rank"] or 999)
    return records


def _sector_rows(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["sector"]].append(record)

    total_revenue = sum(record["latest_revenue"] for record in records)
    rows: List[Dict[str, Any]] = []

    for sector, members in grouped.items():
        revenue = sum(record["latest_revenue"] for record in members)
        pat = sum(record["latest_pat"] for record in members)
        ebitda = sum(record["latest_ebitda"] for record in members)
        prior = sum(
            record["prior_revenue"] for record in members if record["prior_revenue"]
        )
        latest_same = sum(
            record["latest_revenue"] for record in members if record["prior_revenue"]
        )
        growth = _pct(latest_same - prior, prior)
        risk = Counter(record["risk_flag"] for record in members)
        top = max(members, key=lambda record: record["latest_revenue"])

        rows.append(
            {
                "sector": sector,
                "companies": len(members),
                "revenue": _round(revenue, 1),
                "revenue_share_pct": _round(_pct(revenue, total_revenue), 1),
                "growth_pct": _round(growth, 2),
                "median_growth_pct": _round(
                    _median([record["revenue_growth_pct"] for record in members]), 2
                ),
                "pat": _round(pat, 1),
                "pat_margin": _round(_pct(pat, revenue), 2),
                "ebitda_margin": _round(_pct(ebitda, revenue), 2),
                "risk_counts": {flag: risk.get(flag, 0) for flag in RISK_ORDER},
                "top_company": {
                    "id": top["id"],
                    "name": top["name"],
                    "revenue": top["latest_revenue"],
                    "growth_pct": top["revenue_growth_pct"],
                },
                "company_ids": [record["id"] for record in members],
            }
        )

    rows.sort(key=lambda row: row["revenue"], reverse=True)
    return rows


def _year_series(
    financials: List[Dict[str, Any]], include_company_ids: Optional[set] = None
) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in financials:
        if include_company_ids is not None and row.get("company_id") not in include_company_ids:
            continue
        grouped[row.get("fiscal_year")].append(row)

    series: List[Dict[str, Any]] = []
    previous_revenue: Optional[float] = None

    for fiscal_year in sorted(grouped, key=_fy_number):
        rows = grouped[fiscal_year]
        revenue = sum(_num(row.get("revenue")) for row in rows)
        ebitda = sum(_num(row.get("ebitda")) for row in rows)
        pat = sum(_num(row.get("pat")) for row in rows)
        companies = len({row.get("company_id") for row in rows if row.get("company_id")})
        item = {
            "fiscal_year": fiscal_year,
            "companies": companies,
            "revenue": _round(revenue, 1),
            "ebitda": _round(ebitda, 1),
            "pat": _round(pat, 1),
            "pat_margin": _round(_pct(pat, revenue), 2),
            "ebitda_margin": _round(_pct(ebitda, revenue), 2),
            "median_pat_margin": _round(
                _median(
                    [
                        _pct(_num(row.get("pat")), _num(row.get("revenue")))
                        for row in rows
                        if _num(row.get("revenue"))
                    ]
                ),
                2,
            ),
        }
        if previous_revenue:
            item["revenue_growth_pct"] = _round(
                _pct(revenue - previous_revenue, previous_revenue), 2
            )
        series.append(item)
        previous_revenue = revenue

    return series


def _coverage_by_year(financials: List[Dict[str, Any]]) -> Dict[str, set]:
    coverage: Dict[str, set] = defaultdict(set)
    for row in financials:
        if row.get("company_id"):
            coverage[row.get("fiscal_year")].add(row["company_id"])
    return coverage


def _balanced_ids(
    companies: List[Dict[str, Any]], financials: List[Dict[str, Any]]
) -> tuple[List[str], List[str]]:
    coverage = _coverage_by_year(financials)
    threshold = max(3, math.ceil(len(companies) * 0.7))
    core_years = [
        year
        for year in sorted(coverage, key=_fy_number)
        if len(coverage[year]) >= threshold
    ]
    if len(core_years) < 2:
        return core_years, [company.get("id") for company in companies]

    history = _history_by_company(financials)
    balanced = [
        company.get("id")
        for company in companies
        if all(year in {row.get("fiscal_year") for row in history.get(company.get("id"), [])} for year in core_years)
    ]
    return core_years, balanced


def _risk_block(records: List[Dict[str, Any]], total_revenue: float) -> Dict[str, Any]:
    counts = Counter(record["risk_flag"] for record in records)
    high = [record for record in records if record["risk_flag"] == "HIGH"]
    high_revenue = sum(record["latest_revenue"] for record in high)
    negative = sorted(
        [record for record in records if record["revenue_growth_pct"] < 0],
        key=lambda record: record["revenue_growth_pct"],
    )
    leverage = sorted(
        [record for record in records if record["latest_debt_to_equity"] > 0.01],
        key=lambda record: record["latest_debt_to_equity"],
        reverse=True,
    )

    return {
        "counts": {flag: counts.get(flag, 0) for flag in RISK_ORDER},
        "pct": {
            flag: _round(_pct(counts.get(flag, 0), len(records)), 1)
            for flag in RISK_ORDER
        },
        "high_risk_revenue_share_pct": _round(_pct(high_revenue, total_revenue), 1),
        "negative_growth": [
            {
                "id": record["id"],
                "name": record["name"],
                "sector": record["sector"],
                "growth_pct": record["revenue_growth_pct"],
                "pat_margin": record["pat_margin"],
                "risk_flag": record["risk_flag"],
            }
            for record in negative
        ],
        "leverage_outliers": [
            {
                "id": record["id"],
                "name": record["name"],
                "debt_to_equity": record["latest_debt_to_equity"],
                "risk_flag": record["risk_flag"],
            }
            for record in leverage
        ],
    }


def _coverage_block(
    records: List[Dict[str, Any]],
    filings: List[Dict[str, Any]],
    chunks: Dict[str, Any],
) -> Dict[str, Any]:
    financial_years = sorted(
        {year for record in records for year in (item["fiscal_year"] for item in record["history"])},
        key=_fy_number,
    )
    filing_years = sorted(
        {filing.get("fiscal_year") for filing in filings if filing.get("fiscal_year")},
        key=_fy_number,
    )
    filing_by_company: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for filing in filings:
        if filing.get("company_id"):
            filing_by_company[filing["company_id"]].append(filing)

    rows = []
    for record in records:
        docs = filing_by_company.get(record["id"], [])
        year_counts = Counter(filing.get("fiscal_year") for filing in docs)
        rows.append(
            {
                "id": record["id"],
                "name": record["name"],
                "sector": record["sector"],
                "docs": len(docs),
                "pages": sum(int(_num(filing.get("page_count"))) for filing in docs),
                "chunks": int(chunks.get("by_company", {}).get(record["id"], 0)),
                "years": {
                    year: year_counts.get(year, 0) for year in filing_years
                },
            }
        )

    by_year = [
        {
            "fiscal_year": year,
            "companies": len(
                {
                    filing.get("company_id")
                    for filing in filings
                    if filing.get("fiscal_year") == year
                }
            ),
            "documents": sum(
                1 for filing in filings if filing.get("fiscal_year") == year
            ),
        }
        for year in filing_years
    ]

    financial_by_year = []
    for year in financial_years:
        financial_by_year.append(
            {
                "fiscal_year": year,
                "companies": sum(
                    1
                    for record in records
                    if any(item["fiscal_year"] == year for item in record["history"])
                ),
            }
        )

    return {
        "filing_years": filing_years,
        "financial_years": financial_by_year,
        "companies": rows,
        "by_year": by_year,
        "filing_coverage_pct": _round(
            _pct(
                sum(1 for record in records if filing_by_company.get(record["id"])),
                len(records),
            ),
            1,
        ),
    }


def _signals(
    overview: Dict[str, Any],
) -> List[Dict[str, Any]]:
    kpis = overview["kpis"]
    sectors = overview["sectors"]
    risk = overview["risk"]
    records = overview["companies"]

    high = [record for record in records if record["risk_flag"] == "HIGH"]
    high_revenue = sum(record["latest_revenue"] for record in high)
    top_sector = sectors[0] if sectors else None
    fast = max(records, key=lambda record: record["revenue_growth_pct"])
    margin_leader = max(records, key=lambda record: record["pat_margin"])
    top_five = sorted(records, key=lambda record: record["latest_revenue"], reverse=True)[:5]

    signals = [
        {
            "id": "cagr",
            "tone": "positive" if kpis["cagr_pct"] >= 0 else "warning",
            "title": f"Revenue compounding at {_plain_pct(kpis['cagr_pct'])}",
            "detail": (
                f"Balanced FY2022–FY2026 panel of {kpis['balanced_companies']} companies. "
                f"PAT margin moved from {_plain_pct(kpis['pat_margin_first_pct'])} to "
                f"{_plain_pct(kpis['pat_margin_pct'])}."
            ),
            "metric": _plain_pct(kpis["cagr_pct"]),
        },
        {
            "id": "dispersion",
            "tone": "neutral",
            "title": "Fast growers are small",
            "detail": (
                f"{fast['name']} leads at {_pct_text(fast['revenue_growth_pct'])} on "
                f"{_cr(fast['latest_revenue'])} revenue. The top three growers hold "
                f"{_plain_pct(kpis['fast_growers_revenue_share_pct'])} of tracked revenue."
            ),
            "metric": _pct_text(fast["revenue_growth_pct"]),
        },
        {
            "id": "risk",
            "tone": "warning" if risk["counts"]["HIGH"] else "neutral",
            "title": "Risk sits with scale",
            "detail": (
                f"{risk['counts']['HIGH']} HIGH-risk companies hold "
                f"{_plain_pct(risk['high_risk_revenue_share_pct'])} of tracked revenue. "
                f"{len(risk['negative_growth'])} companies are shrinking."
            ),
            "metric": f"{risk['counts']['HIGH']} HIGH",
        },
        {
            "id": "concentration",
            "tone": "neutral",
            "title": f"Top five hold {_plain_pct(kpis['top5_share_pct'])} of revenue",
            "detail": (
                f"{top_five[0]['name']} is the largest at {_cr(top_five[0]['latest_revenue'])}. "
                f"{top_sector['sector'] if top_sector else 'The largest sector'} leads sector mix at "
                f"{_plain_pct(top_sector['revenue_share_pct']) if top_sector else '—'}."
            ),
            "metric": _plain_pct(kpis["top5_share_pct"]),
        },
        {
            "id": "coverage",
            "tone": "positive",
            "title": "Every company has filings",
            "detail": (
                f"{kpis['filings']} annual reports · {kpis['pages']:,} pages · "
                f"{kpis['chunks']:,} retrieval chunks. Margin leader: "
                f"{margin_leader['name']} at {_plain_pct(margin_leader['pat_margin'])}."
            ),
            "metric": f"{kpis['filing_coverage_pct']:.0f}%",
        },
    ]

    return signals


# ---------------------------------------------------------------------------
# Overview payload
# ---------------------------------------------------------------------------


def build_overview(
    companies: List[Dict[str, Any]],
    financials: List[Dict[str, Any]],
    filings: List[Dict[str, Any]],
    chunks: Optional[Dict[str, Any]] = None,
    refreshed_at: Optional[str] = None,
) -> Dict[str, Any]:
    chunks = chunks or {"by_company": {}, "total": 0}
    records = _company_records(companies, financials)
    sectors = _sector_rows(records)

    years = sorted(
        {row.get("fiscal_year") for row in financials if row.get("fiscal_year")},
        key=_fy_number,
    )
    latest_year = years[-1] if years else ""
    core_years, balanced_ids = _balanced_ids(companies, financials)
    balanced_set = set(balanced_ids)
    series = _year_series(financials)
    balanced_series = _year_series(financials, balanced_set) if balanced_set else series

    tracked_revenue = sum(record["latest_revenue"] for record in records)
    latest_series = balanced_series[-1] if balanced_series else {}
    first_series = balanced_series[0] if balanced_series else {}
    latest_revenue = _num(latest_series.get("revenue"))
    latest_reporters = int(_num(latest_series.get("companies")))
    periods = max(1, len(balanced_series) - 1)
    cagr = (
        ((latest_revenue / _num(first_series.get("revenue"))) ** (1 / periods) - 1) * 100
        if _num(first_series.get("revenue")) and latest_revenue
        else 0.0
    )

    pairs = [
        (record["latest_revenue"], record["prior_revenue"])
        for record in records
        if record["prior_revenue"]
    ]
    like_for_like_growth = (
        _pct(sum(latest for latest, _ in pairs) - sum(prior for _, prior in pairs), sum(prior for _, prior in pairs))
        if pairs
        else 0.0
    )

    high = [record for record in records if record["risk_flag"] == "HIGH"]
    negative = [record for record in records if record["revenue_growth_pct"] < 0]
    fast = sorted(records, key=lambda record: record["revenue_growth_pct"], reverse=True)
    top_five = sorted(records, key=lambda record: record["latest_revenue"], reverse=True)[:5]
    top_three_growers = fast[:3]
    source_counts = Counter(record["data_source"] for record in records)
    risk = _risk_block(records, tracked_revenue)
    coverage = _coverage_block(records, filings, chunks)

    kpis = {
        "companies": len(records),
        "sectors": len(sectors),
        "financial_rows": len(financials),
        "filings": len(filings),
        "pages": sum(int(_num(filing.get("page_count"))) for filing in filings),
        "chunks": int(chunks.get("total", 0)),
        "years": len(years),
        "first_year": years[0] if years else "",
        "latest_year": latest_year,
        "tracked_revenue": _round(tracked_revenue, 1),
        "latest_revenue": _round(latest_revenue, 1),
        "latest_reporters": latest_reporters,
        "like_for_like_growth_pct": _round(like_for_like_growth, 2),
        "median_growth_pct": _round(
            _median([record["revenue_growth_pct"] for record in records]), 2
        ),
        "cagr_pct": _round(cagr, 2),
        "pat_margin_pct": _round(_num(latest_series.get("pat_margin")), 2),
        "pat_margin_first_pct": _round(_num(first_series.get("pat_margin")), 2),
        "ebitda_margin_pct": _round(_num(latest_series.get("ebitda_margin")), 2),
        "high_risk_count": len(high),
        "high_risk_pct": _round(_pct(len(high), len(records)), 1),
        "negative_growth_count": len(negative),
        "top5_share_pct": _round(
            _pct(sum(record["latest_revenue"] for record in top_five), tracked_revenue), 1
        ),
        "fast_growers_revenue_share_pct": _round(
            _pct(
                sum(record["latest_revenue"] for record in top_three_growers),
                tracked_revenue,
            ),
            1,
        ),
        "balanced_companies": len(balanced_ids),
        "balanced_years": core_years,
        "filing_coverage_pct": coverage["filing_coverage_pct"],
    }

    datasets = [
        {
            "id": "universe",
            "name": "Company universe",
            "rows": len(records),
            "unit": "companies",
            "source": "data/config/universe.json",
            "description": "BSE-listed SME profiles with sector, ticker, risk flag, and provenance.",
            "fields": ["id", "name", "sector", "ticker", "bse_code", "risk_flag", "data_source"],
        },
        {
            "id": "financials",
            "name": "Financial statements",
            "rows": len(financials),
            "unit": "company-years",
            "source": "data/processed/financials.json",
            "description": "Revenue, EBITDA, PAT, and debt/equity from FY2020 onward.",
            "fields": ["company_id", "fiscal_year", "revenue", "ebitda", "pat", "debt_to_equity"],
        },
        {
            "id": "filings",
            "name": "Annual report filings",
            "rows": len(filings),
            "unit": "documents",
            "source": "data/processed/filings.json",
            "description": "Filing metadata used for retrieval and citation coverage.",
            "fields": ["company_id", "title", "fiscal_year", "pdf_hash", "page_count"],
        },
        {
            "id": "retrieval",
            "name": "Retrieval corpus",
            "rows": int(chunks.get("total", 0)),
            "unit": "chunks",
            "source": "data/processed/chunks_manifest.json",
            "description": "Section-aligned filing chunks embedded for grounded Q&A.",
            "fields": ["company_id", "filing_year", "doc_title", "page", "chunk_index", "text"],
        },
    ]

    overview: Dict[str, Any] = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "last_refresh": refreshed_at,
            "currency": "INR crore",
            "fy_start": years[0] if years else "",
            "fy_end": latest_year,
            "definitions": {
                "tracked_revenue": "Sum of each company's latest reported revenue.",
                "like_for_like_growth_pct": "Aggregate latest vs prior year across the same companies.",
                "pat_margin_pct": "Balanced panel: companies reporting every core year.",
                "cagr_pct": "Balanced panel compound annual growth across the core years.",
            },
        },
        "kpis": kpis,
        "series": series,
        "balanced_series": balanced_series,
        "sectors": sectors,
        "companies": records,
        "risk": risk,
        "coverage": coverage,
        "provenance": [
            {"source": source, "count": count}
            for source, count in source_counts.most_common()
        ],
        "datasets": datasets,
        "ranking": records,
    }
    overview["signals"] = _signals(overview)
    return overview


# ---------------------------------------------------------------------------
# Grounded answer engine
# ---------------------------------------------------------------------------


def _company_aliases(record: Dict[str, Any]) -> set:
    name = (record.get("name") or "").lower()
    cleaned = re.sub(r"\b(ltd|limited|inc|corp|corporation|company)\b", "", name)
    words = re.findall(r"[a-z0-9]+", cleaned)
    aliases = {
        name,
        cleaned.strip(),
        (record.get("ticker") or "").lower(),
        (record.get("id") or "").lower(),
    }
    if words:
        if len(words[0]) >= 4:
            aliases.add(words[0])
        if len(words) >= 2:
            aliases.add(" ".join(words[:2]))
    return {alias.strip() for alias in aliases if len(alias.strip()) >= 3}


def _match_companies(question: str, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    found: List[tuple] = []
    for record in records:
        best = None
        for alias in sorted(_company_aliases(record), key=len, reverse=True):
            match = re.search(
                rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", question
            )
            if match:
                best = match.start()
                break
        if best is not None:
            found.append((best, record))
    found.sort(key=lambda item: item[0])
    return [record for _, record in found]


def resolve_company_id(question: str, overview: Dict[str, Any]) -> Optional[str]:
    """Resolve a company named in a question so retrieval can be scoped."""
    matches = _match_companies((question or "").lower(), overview.get("companies", []))
    return matches[0]["id"] if len(matches) == 1 else None


def keyword_filing_hits(
    company_id: Optional[str], question: str, top_k: int = 5
) -> List[Dict[str, Any]]:
    """Find exact section-style passages in the committed chunk corpus.

    TF-IDF is good at semantic similarity but noisy on long annual reports.
    When someone asks about risk or strategy, a heading-aware keyword pass
    finds the relevant section far more reliably.
    """
    lower = (question or "").lower()
    if any(term in lower for term in ("risk", "litigation", "governance")):
        terms = (
            "risk",
            "risks",
            "litigation",
            "uncertainty",
            "threat",
            "exposure",
            "contingent",
            "internal control",
            "going concern",
        )
        headings = (
            "key business risks",
            "risk factors",
            "risk management",
            "risks & concerns",
            "risks and concerns",
            "financial risk management",
            "principal risks",
            "material risks",
            "internal control",
        )
        required = ("risk", "litigation", "uncertainty")
    elif any(term in lower for term in ("strategy", "outlook", "growth plan", "expansion")):
        terms = ("strategy", "strategic", "outlook", "growth plan", "expansion", "capex", "order book")
        headings = ("strategy", "outlook", "business overview", "growth")
        required = ("strateg", "outlook", "growth")
    elif any(term in lower for term in ("management", "leadership", "board")):
        terms = ("management", "directors", "board", "leadership", "promoter")
        headings = ("management discussion", "directors' report", "board of directors")
        required = ("management", "director", "board")
    else:
        terms = tuple(
            word
            for word in re.findall(r"[a-z]{4,}", lower)
            if word not in {"what", "does", "about", "with", "from", "this", "that", "have", "company"}
        )[:8]
        headings = ()
        required = ()

    scored = []
    for chunk in chunk_rows():
        if company_id and chunk.get("company_id") != company_id:
            continue
        raw = str(chunk.get("text", ""))
        text = re.sub(r"\s+", " ", raw).lower()[:4000]
        if not text:
            continue
        if required and not any(term in text for term in required):
            continue
        if any(noise in text[:420] for noise in NOISE_HEADINGS):
            continue
        count = sum(text.count(term) for term in terms)
        if any(heading in text[:320] for heading in headings):
            heading_bonus = 12
        elif any(heading in text[:1200] for heading in headings):
            heading_bonus = 6
        else:
            heading_bonus = 0
        if not count and not heading_bonus:
            continue
        density = min(8, count / max(0.6, len(text) / 1000))
        score = heading_bonus + count * 1.5 + density
        if score <= 0:
            continue
        scored.append(
            (
                score,
                {
                    "score": round(score, 3),
                    "company_id": chunk.get("company_id", ""),
                    "doc_title": chunk.get("doc_title", ""),
                    "page": chunk.get("page", 0),
                    "filing_year": chunk.get("filing_year", ""),
                    "excerpt": raw[:1400],
                },
            )
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    hits = []
    seen = set()
    for _, hit in scored:
        key = (hit["doc_title"], hit["page"])
        if key in seen:
            continue
        seen.add(key)
        hits.append(hit)
        if len(hits) >= top_k:
            break
    return hits


def rank_filing_hits(
    hits: List[Dict[str, Any]], question: str
) -> List[Dict[str, Any]]:
    """Prefer passages that actually discuss risk when the question asks for it."""
    lower = (question or "").lower()
    if not any(term in lower for term in ("risk", "litigation", "governance")):
        return hits

    terms = (
        "risk",
        "risks",
        "litigation",
        "uncertainty",
        "threat",
        "exposure",
        "contingent",
        "internal control",
        "going concern",
    )
    headings = (
        "key business risks",
        "risk factors",
        "risk management",
        "internal control",
        "material risks",
        "principal risks",
    )

    def score(hit: Dict[str, Any]) -> tuple:
        text = str(hit.get("excerpt", "")).lower()
        keyword_score = sum(text.count(term) for term in terms)
        heading_bonus = 3 if any(heading in text[:900] for heading in headings) else 0
        return (keyword_score * 2 + heading_bonus, float(hit.get("score") or 0))

    return sorted(hits, key=score, reverse=True)


def _match_sectors(question: str, sectors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    matched = []
    for row in sectors:
        aliases = SECTOR_ALIASES.get(row["sector"], (row["sector"].lower(),))
        if any(re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", question) for alias in aliases):
            matched.append(row)
    return matched


def _financial_citation(overview: Dict[str, Any], detail: Optional[str] = None) -> Dict[str, Any]:
    kpis = overview["kpis"]
    return {
        "kind": "dataset",
        "label": "Financial statements",
        "detail": detail
        or f"{kpis['financial_rows']} rows · {kpis['first_year']}–{kpis['latest_year']}",
    }


def _filings_citation(overview: Dict[str, Any]) -> Dict[str, Any]:
    kpis = overview["kpis"]
    return {
        "kind": "dataset",
        "label": "Filings corpus",
        "detail": f"{kpis['filings']} documents · {kpis['chunks']:,} chunks",
    }


def _hit_citation(hit: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "kind": "filing",
        "label": hit.get("doc_title") or "Filing",
        "detail": f"{hit.get('filing_year') or '—'} · p.{hit.get('page', '?')}",
    }


def _chart_bar(
    title: str, rows: List[Dict[str, Any]], value_label: str, unit: str = "currency"
) -> Dict[str, Any]:
    return {
        "type": "bar",
        "title": title,
        "value_label": value_label,
        "unit": unit,
        "data": rows,
    }


def _chart_line(
    title: str,
    rows: List[Dict[str, Any]],
    series: List[Dict[str, str]],
    unit: str = "currency",
) -> Dict[str, Any]:
    return {
        "type": "line",
        "title": title,
        "unit": unit,
        "series": series,
        "data": rows,
    }


def _result(
    intent: str,
    answer: str,
    facts: Optional[List[Dict[str, Any]]] = None,
    chart: Optional[Dict[str, Any]] = None,
    citations: Optional[List[Dict[str, Any]]] = None,
    suggestions: Optional[List[str]] = None,
    company_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "intent": intent,
        "answer": answer.strip(),
        "facts": facts or [],
        "chart": chart,
        "citations": citations or [],
        "suggestions": suggestions or DEFAULT_SUGGESTIONS,
        "meta": {
            "engine": "structured",
            "intent": intent,
            "company_id": company_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def _overview_answer(overview: Dict[str, Any]) -> Dict[str, Any]:
    kpis = overview["kpis"]
    sectors = overview["sectors"]
    top_sector = sectors[0] if sectors else None
    fast = max(overview["companies"], key=lambda record: record["revenue_growth_pct"])
    top_sector_text = (
        f"{top_sector['sector']} is the largest sector at "
        f"{_plain_pct(top_sector['revenue_share_pct'])} of tracked revenue."
        if top_sector
        else ""
    )
    answer = (
        f"The workspace tracks {kpis['companies']} BSE-listed companies across "
        f"{kpis['sectors']} sectors. Latest reported revenue totals "
        f"{_cr(kpis['tracked_revenue'])}, with like-for-like growth of "
        f"{_plain_pct(kpis['like_for_like_growth_pct'])}. In the balanced "
        f"{kpis['latest_year']} panel ({kpis['balanced_companies']} companies), "
        f"the PAT margin is {_plain_pct(kpis['pat_margin_pct'])}.\n\n"
        f"{top_sector_text} {fast['name']} is the fastest grower at "
        f"{_pct_text(fast['revenue_growth_pct'])}. "
        f"{kpis['high_risk_count']} companies carry a HIGH risk flag, and "
        f"{kpis['negative_growth_count']} are shrinking."
    )
    chart = _chart_bar(
        "Revenue by sector",
        [
            {"label": row["sector"], "value": row["revenue"]}
            for row in sectors
        ],
        "₹ Cr",
    )
    return _result(
        "overview",
        answer,
        facts=[
            {"label": "Tracked revenue", "value": _cr(kpis["tracked_revenue"]), "detail": "latest report per company"},
            {"label": "Like-for-like growth", "value": _pct_text(kpis["like_for_like_growth_pct"]), "detail": "18 companies"},
            {"label": "PAT margin", "value": _plain_pct(kpis["pat_margin_pct"]), "detail": f"balanced {kpis['latest_year']}"},
            {"label": "HIGH risk", "value": f"{kpis['high_risk_count']} of {kpis['companies']}", "detail": f"{_plain_pct(kpis['high_risk_pct'])} of universe"},
        ],
        chart=chart,
        citations=[_financial_citation(overview), _filings_citation(overview)],
    )


def _company_answer(
    record: Dict[str, Any],
    overview: Dict[str, Any],
    filing_hits: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    history = record["history"]
    growth = record["revenue_growth_pct"]
    growth_text = (
        f"up {_plain_pct(growth)} year on year"
        if growth >= 0
        else f"down {_plain_pct(abs(growth))} year on year"
    )
    answer = (
        f"{record['name']} reported {_cr(record['latest_revenue'])} revenue in "
        f"{record['latest_year'] or 'its latest year'}, {growth_text}. "
        f"PAT was {_cr(record['latest_pat'])} ({_plain_pct(record['pat_margin'])} margin) "
        f"and EBITDA {_cr(record['latest_ebitda'])} ({_plain_pct(record['ebitda_margin'])} margin). "
        f"Debt/equity is {_ratio(record['latest_debt_to_equity'])} and the screen ranks it "
        f"#{record['rank']} with a {record['risk_flag']} risk flag."
    )
    if len(history) > 1:
        first, last = history[0], history[-1]
        if first["revenue"] and last["revenue"]:
            years = max(1, _fy_number(last["fiscal_year"]) - _fy_number(first["fiscal_year"]))
            cagr = ((last["revenue"] / first["revenue"]) ** (1 / years) - 1) * 100
            answer += (
                f" Revenue compounded at {_plain_pct(cagr)} from "
                f"{first['fiscal_year']} to {last['fiscal_year']}."
            )
    if record["data_source"] == "seed":
        answer += " This profile uses the seed fallback, so treat the figures as approximate."
    if filing_hits:
        excerpt = _clean_excerpt(filing_hits[0].get("excerpt", ""))
        if excerpt:
            answer += (
                f"\n\nFilings add: “{excerpt}” — {filing_hits[0].get('doc_title', 'Filing')}, "
                f"p.{filing_hits[0].get('page', '?')}."
            )

    chart_rows = [
        {
            "label": item["fiscal_year"].replace("FY20", "FY"),
            "value": item["revenue"],
            "value2": item["pat"],
        }
        for item in history
    ]
    citations = [_financial_citation(overview, f"{record['name']} · {record['latest_year']}")]
    citations.extend(_hit_citation(hit) for hit in (filing_hits or [])[:2])
    return _result(
        "company",
        answer,
        facts=[
            {"label": "Revenue", "value": _cr(record["latest_revenue"]), "detail": record["latest_year"]},
            {"label": "Growth", "value": _pct_text(growth), "detail": "year on year"},
            {"label": "PAT margin", "value": _plain_pct(record["pat_margin"]), "detail": _cr(record["latest_pat"])},
            {"label": "Debt / equity", "value": _ratio(record["latest_debt_to_equity"]), "detail": "latest report"},
            {"label": "Screen score", "value": f"{record['score']:.1f}", "detail": f"rank #{record['rank']}"},
        ],
        chart=_chart_line(
            f"{record['name']} · revenue and PAT",
            chart_rows,
            [
                {"key": "value", "label": "Revenue"},
                {"key": "value2", "label": "PAT"},
            ],
            unit="mixed",
        ),
        citations=citations,
        suggestions=[
            f"How does {record['name']} compare with {record['sector']}?",
            f"What risks do {record['name']} filings flag?",
            f"Show {record['name']} five-year history",
        ],
        company_id=record["id"],
    )


def _compare_answer(
    records: List[Dict[str, Any]], overview: Dict[str, Any]
) -> Dict[str, Any]:
    first, second = records[0], records[1]
    larger = first if first["latest_revenue"] >= second["latest_revenue"] else second
    faster = first if first["revenue_growth_pct"] >= second["revenue_growth_pct"] else second
    more_profitable = first if first["pat_margin"] >= second["pat_margin"] else second
    better_rank = first if first["rank"] <= second["rank"] else second
    answer = (
        f"{larger['name']} is the larger business at {_cr(larger['latest_revenue'])} "
        f"versus {_cr(second['latest_revenue'] if larger is first else first['latest_revenue'])}. "
        f"{faster['name']} is growing faster at {_pct_text(faster['revenue_growth_pct'])} "
        f"versus {_pct_text(second['revenue_growth_pct'] if faster is first else first['revenue_growth_pct'])}. "
        f"{more_profitable['name']} earns the stronger PAT margin at "
        f"{_plain_pct(more_profitable['pat_margin'])}. "
        f"On the transparent screen, {better_rank['name']} leads at "
        f"#{better_rank['rank']} ({better_rank['score']:.1f}/100)."
    )
    comparison = [first, second]
    return _result(
        "compare",
        answer,
        facts=[
            {
                "label": record["name"].split(" ")[0],
                "value": _cr(record["latest_revenue"]),
                "detail": f"{_pct_text(record['revenue_growth_pct'])} · {_plain_pct(record['pat_margin'])} margin",
            }
            for record in comparison
        ],
        chart=_chart_bar(
            "Latest reported revenue",
            [{"label": record["name"], "value": record["latest_revenue"]} for record in comparison],
            "₹ Cr",
        ),
        citations=[_financial_citation(overview, "latest reported year per company")],
        suggestions=[
            f"Which has more risk: {first['name']} or {second['name']}?",
            f"What do {first['name']} filings say about growth?",
            "Show sector comparison",
        ],
    )


def _rank_answer(
    records: List[Dict[str, Any]],
    metric: str,
    overview: Dict[str, Any],
) -> Dict[str, Any]:
    labels = {
        "growth": ("revenue_growth_pct", "Revenue growth", "percent"),
        "revenue": ("latest_revenue", "Latest revenue", "currency"),
        "margin": ("pat_margin", "PAT margin", "percent"),
        "ebitda_margin": ("ebitda_margin", "EBITDA margin", "percent"),
        "score": ("score", "Screen score", "number"),
    }
    key, label, unit = labels[metric]
    ranked = sorted(records, key=lambda record: record[key], reverse=True)
    top = ranked[:5]
    bottom = ranked[-3:]
    if unit == "percent":
        formatter = _plain_pct
    elif unit == "currency":
        formatter = _cr
    else:
        formatter = lambda value: f"{value:.1f}"  # noqa: E731

    if metric == "growth":
        answer = (
            f"{top[0]['name']} leads revenue growth at {_pct_text(top[0][key])}, "
            f"followed by {top[1]['name']} ({_pct_text(top[1][key])}) and "
            f"{top[2]['name']} ({_pct_text(top[2][key])}). "
            f"Across the universe the median company grew {_plain_pct(overview['kpis']['median_growth_pct'])}. "
            f"{overview['kpis']['negative_growth_count']} companies are shrinking; "
            f"{bottom[0]['name']} is the steepest at {_pct_text(bottom[0][key])}."
        )
    elif metric == "revenue":
        top_five_revenue = sum(record["latest_revenue"] for record in top)
        answer = (
            f"{top[0]['name']} is the largest company at {_cr(top[0]['latest_revenue'])}, "
            f"followed by {top[1]['name']} ({_cr(top[1]['latest_revenue'])}) and "
            f"{top[2]['name']} ({_cr(top[2]['latest_revenue'])}). "
            f"The top five account for {_plain_pct(_pct(top_five_revenue, overview['kpis']['tracked_revenue']))} "
            f"of tracked revenue."
        )
    elif metric in ("margin", "ebitda_margin"):
        universe_margin = (
            overview["kpis"]["ebitda_margin_pct"]
            if metric == "ebitda_margin"
            else overview["kpis"]["pat_margin_pct"]
        )
        answer = (
            f"{top[0]['name']} has the highest {label.lower()} at {_plain_pct(top[0][key])}, "
            f"ahead of {top[1]['name']} ({_plain_pct(top[1][key])}) and "
            f"{top[2]['name']} ({_plain_pct(top[2][key])}). "
            f"The balanced-panel universe {label.lower()} is "
            f"{_plain_pct(universe_margin)}."
        )
    else:
        answer = (
            f"{top[0]['name']} leads the screen at {top[0]['score']:.1f}/100, "
            f"followed by {top[1]['name']} ({top[1]['score']:.1f}) and "
            f"{top[2]['name']} ({top[2]['score']:.1f}). "
            f"The score weights growth 40%, scale 30%, and risk 30%."
        )

    if metric == "growth":
        facts = [
            {"label": "Top growth", "value": formatter(top[0][key]), "detail": top[0]["name"]},
            {"label": "Universe median", "value": _plain_pct(overview["kpis"]["median_growth_pct"]), "detail": "revenue growth"},
            {"label": "Shrinking", "value": f"{overview['kpis']['negative_growth_count']} companies", "detail": "negative growth"},
        ]
    elif metric == "revenue":
        facts = [
            {"label": "Largest company", "value": formatter(top[0][key]), "detail": top[0]["name"]},
            {"label": "Top-five share", "value": _plain_pct(overview["kpis"]["top5_share_pct"]), "detail": "of tracked revenue"},
            {"label": "Universe", "value": f"{overview['kpis']['companies']} companies", "detail": "latest report per company"},
        ]
    elif metric in ("margin", "ebitda_margin"):
        universe_margin = (
            overview["kpis"]["ebitda_margin_pct"]
            if metric == "ebitda_margin"
            else overview["kpis"]["pat_margin_pct"]
        )
        facts = [
            {"label": f"Top {label.lower()}", "value": formatter(top[0][key]), "detail": top[0]["name"]},
            {"label": "Universe margin", "value": _plain_pct(universe_margin), "detail": "balanced panel"},
            {"label": "HIGH risk", "value": f"{overview['kpis']['high_risk_count']} of {overview['kpis']['companies']}", "detail": "rule-based flag"},
        ]
    else:
        facts = [
            {"label": "Top score", "value": formatter(top[0][key]), "detail": top[0]["name"]},
            {"label": "HIGH risk", "value": f"{overview['kpis']['high_risk_count']} of {overview['kpis']['companies']}", "detail": "rule-based flag"},
            {"label": "Weighting", "value": "40 / 30 / 30", "detail": "growth / scale / risk"},
        ]

    return _result(
        metric,
        answer,
        facts=facts,
        chart=_chart_bar(
            label,
            [
                {"label": record["name"], "value": record[key]}
                for record in top
            ],
            "₹ Cr" if unit == "currency" else "%" if unit == "percent" else "score",
            unit=unit,
        ),
        citations=[_financial_citation(overview)],
        suggestions=[
            "Which fast growers carry high risk?",
            "Show sector growth",
            "How did PAT margins trend?",
        ],
    )


def _risk_answer(
    records: List[Dict[str, Any]], overview: Dict[str, Any], question: str
) -> Dict[str, Any]:
    risk = overview["risk"]
    kpis = overview["kpis"]
    high = [record for record in records if record["risk_flag"] == "HIGH"]
    high_growers = sorted(
        [record for record in high if record["revenue_growth_pct"] > 0],
        key=lambda record: record["revenue_growth_pct"],
        reverse=True,
    )

    if "growing" in question or "growth" in question:
        answer = (
            f"{len(high_growers)} of the {len(high)} HIGH-risk companies are still growing. "
            + ", ".join(
                f"{record['name']} ({_pct_text(record['revenue_growth_pct'])})"
                for record in high_growers[:4]
            )
            + ". Treat the risk flag as a first-pass screen: it combines growth, "
            "leverage, and margin direction, not a view on the business."
        )
        chart_records = high_growers[:6] or high[:6]
        return _result(
            "risk",
            answer,
            facts=[
                {"label": "HIGH risk", "value": str(len(high)), "detail": _plain_pct(kpis["high_risk_pct"]) + " of universe"},
                {"label": "Still growing", "value": str(len(high_growers)), "detail": "positive revenue growth"},
                {"label": "Risk revenue share", "value": _plain_pct(risk["high_risk_revenue_share_pct"]), "detail": "HIGH-risk companies"},
            ],
            chart=_chart_bar(
                "HIGH-risk companies by growth",
                [
                    {"label": record["name"], "value": record["revenue_growth_pct"]}
                    for record in chart_records
                ],
                "%",
                unit="percent",
            ),
            citations=[_financial_citation(overview)],
            suggestions=[
                "Which companies are shrinking?",
                "Show leverage outliers",
                "How is risk spread across sectors?",
            ],
        )

    if "sector" in question:
        sector_risk = sorted(
            overview["sectors"],
            key=lambda row: row["risk_counts"]["HIGH"],
            reverse=True,
        )
        answer = (
            "HIGH-risk exposure by sector: "
            + ", ".join(
                f"{row['sector']} {row['risk_counts']['HIGH']}/{row['companies']}"
                for row in sector_risk
            )
            + ". The flag is rule-based and does not adjust for company size."
        )
        return _result(
            "risk",
            answer,
            facts=[
                {"label": "HIGH risk", "value": str(kpis["high_risk_count"]), "detail": "companies"},
                {"label": "Risk revenue share", "value": _plain_pct(risk["high_risk_revenue_share_pct"]), "detail": "HIGH-risk companies"},
                {"label": "Most exposed sector", "value": sector_risk[0]["sector"], "detail": f"{sector_risk[0]['risk_counts']['HIGH']} HIGH"},
            ],
            chart=_chart_bar(
                "HIGH-risk companies by sector",
                [
                    {"label": row["sector"], "value": row["risk_counts"]["HIGH"]}
                    for row in sector_risk
                ],
                "companies",
                unit="number",
            ),
            citations=[_financial_citation(overview)],
            suggestions=[
                "Which high-risk companies are still growing?",
                "Show leverage outliers",
                "Compare sector margins",
            ],
        )

    largest_high = sorted(high, key=lambda record: record["latest_revenue"], reverse=True)[:3]
    negative = risk["negative_growth"]
    answer = (
        f"{kpis['high_risk_count']} of {kpis['companies']} companies carry a HIGH risk flag "
        f"({_plain_pct(kpis['high_risk_pct'])} of the universe), and they hold "
        f"{_plain_pct(risk['high_risk_revenue_share_pct'])} of tracked revenue. "
        f"The largest HIGH-risk names are "
        + ", ".join(f"{record['name']} ({_cr(record['latest_revenue'])})" for record in largest_high)
        + ". "
    )
    if negative:
        answer += (
            f"{len(negative)} companies are shrinking; {negative[0]['name']} is steepest at "
            f"{_pct_text(negative[0]['growth_pct'])} with a "
            f"{_plain_pct(negative[0]['pat_margin'])} PAT margin. "
        )
    leverage = risk["leverage_outliers"]
    if leverage:
        names = [f"{item['name']} ({item['debt_to_equity']:.2f})" for item in leverage]
        answer += f"Only {_join_names(names)} report non-zero debt/equity."
    else:
        answer += "No company reports non-zero debt/equity."

    return _result(
        "risk",
        answer,
        facts=[
            {"label": "HIGH risk", "value": f"{kpis['high_risk_count']} of {kpis['companies']}", "detail": _plain_pct(kpis["high_risk_pct"])},
            {"label": "Risk revenue share", "value": _plain_pct(risk["high_risk_revenue_share_pct"]), "detail": "HIGH-risk companies"},
            {"label": "Shrinking", "value": f"{len(negative)} companies", "detail": "negative growth"},
            {"label": "Leverage outliers", "value": str(len(leverage)), "detail": "non-zero debt/equity"},
        ],
        chart=_chart_bar(
            "Risk flags",
            [
                {"label": "LOW", "value": risk["counts"]["LOW"]},
                {"label": "MEDIUM", "value": risk["counts"]["MEDIUM"]},
                {"label": "HIGH", "value": risk["counts"]["HIGH"]},
            ],
            "companies",
            unit="number",
        ),
        citations=[_financial_citation(overview)],
        suggestions=[
            "Which high-risk companies are still growing?",
            "How is risk spread across sectors?",
            "Show leverage outliers",
        ],
    )


def _sector_answer(
    overview: Dict[str, Any], question: str, matched: List[Dict[str, Any]]
) -> Dict[str, Any]:
    sectors = overview["sectors"]
    metric = "revenue"
    if any(term in question for term in ("grew", "growth", "growing", "fastest")):
        metric = "growth_pct"
    elif any(term in question for term in ("margin", "profitab", "pat")):
        metric = "pat_margin"

    if matched:
        row = matched[0]
        members = [
            record
            for record in overview["companies"]
            if record["sector"] == row["sector"]
        ]
        leaders = sorted(members, key=lambda record: record["latest_revenue"], reverse=True)[:3]
        answer = (
            f"{row['sector']} covers {row['companies']} companies and "
            f"{_cr(row['revenue'])} of latest reported revenue, "
            f"{_plain_pct(row['revenue_share_pct'])} of the universe. "
            f"Aggregate growth is {_pct_text(row['growth_pct'])} and the PAT margin is "
            f"{_plain_pct(row['pat_margin'])}. "
            f"The largest names are "
            + ", ".join(f"{record['name']} ({_cr(record['latest_revenue'])})" for record in leaders)
            + f". Risk mix: {row['risk_counts']['LOW']} LOW, "
            f"{row['risk_counts']['MEDIUM']} MEDIUM, {row['risk_counts']['HIGH']} HIGH."
        )
        return _result(
            "sector",
            answer,
            facts=[
                {"label": "Sector revenue", "value": _cr(row["revenue"]), "detail": f"{_plain_pct(row['revenue_share_pct'])} share"},
                {"label": "Growth", "value": _pct_text(row["growth_pct"]), "detail": "aggregate"},
                {"label": "PAT margin", "value": _plain_pct(row["pat_margin"]), "detail": "sector aggregate"},
                {"label": "HIGH risk", "value": f"{row['risk_counts']['HIGH']} of {row['companies']}", "detail": "rule-based"},
            ],
            chart=_chart_bar(
                f"{row['sector']} · company revenue",
                [{"label": record["name"], "value": record["latest_revenue"]} for record in leaders],
                "₹ Cr",
            ),
            citations=[_financial_citation(overview)],
            suggestions=[
                f"Which {row['sector']} company grew fastest?",
                "Compare sector margins",
                "Where is risk concentrated?",
            ],
        )

    ranked = sorted(sectors, key=lambda row: row[metric], reverse=True)
    label = "revenue growth" if metric == "growth_pct" else "PAT margin" if metric == "pat_margin" else "revenue"
    formatter = (
        (lambda value: _pct_text(value))
        if metric == "growth_pct"
        else (lambda value: _plain_pct(value))
        if metric == "pat_margin"
        else _cr
    )
    answer = (
        f"{ranked[0]['sector']} leads {label} at {formatter(ranked[0][metric])}, "
        f"followed by {ranked[1]['sector']} ({formatter(ranked[1][metric])}) and "
        f"{ranked[2]['sector']} ({formatter(ranked[2][metric])}). "
        f"The gap matters: {ranked[-1]['sector']} sits at {formatter(ranked[-1][metric])}."
    )
    return _result(
        "sector",
        answer,
        facts=[
            {"label": f"Top {label}", "value": formatter(ranked[0][metric]), "detail": ranked[0]["sector"]},
            {"label": "Largest sector", "value": _cr(sectors[0]["revenue"]), "detail": f"{_plain_pct(sectors[0]['revenue_share_pct'])} share"},
            {"label": "Sectors tracked", "value": str(len(sectors)), "detail": "latest report per company"},
        ],
        chart=_chart_bar(
            f"Sector {label}",
            [{"label": row["sector"], "value": row[metric]} for row in ranked],
            "%" if metric != "revenue" else "₹ Cr",
            unit="percent" if metric != "revenue" else "currency",
        ),
        citations=[_financial_citation(overview)],
        suggestions=[
            "Which sector grew fastest?",
            "Compare two companies",
            "Where is margin strongest?",
        ],
    )


def _trend_answer(overview: Dict[str, Any], question: str) -> Dict[str, Any]:
    series = overview["balanced_series"] or overview["series"]
    if not series:
        return _overview_answer(overview)

    if "margin" in question or "profitab" in question:
        key, label, unit = "pat_margin", "PAT margin", "percent"
    elif "ebitda" in question:
        key, label, unit = "ebitda_margin", "EBITDA margin", "percent"
    elif "pat" in question or "profit" in question:
        key, label, unit = "pat", "PAT", "currency"
    else:
        key, label, unit = "revenue", "Revenue", "currency"

    first, last = series[0], series[-1]
    formatter = _plain_pct if unit == "percent" else _cr
    change = last[key] - first[key]
    periods = max(1, len(series) - 1)
    cagr = (
        ((last[key] / first[key]) ** (1 / periods) - 1) * 100
        if first[key] and unit == "currency"
        else 0.0
    )
    answer = (
        f"Across the balanced {first['fiscal_year']}–{last['fiscal_year']} panel of "
        f"{last['companies']} companies, {label} moved from "
        f"{formatter(first[key])} to {formatter(last[key])}"
    )
    answer += (
        f" ({change:+.1f} points)." if unit == "percent" else f" ({_pct_text(cagr)} CAGR)."
    )
    if unit == "percent":
        peak = max(series, key=lambda item: item[key])
        trough = min(series, key=lambda item: item[key])
        answer += (
            f" It peaked at {_plain_pct(peak[key])} in {peak['fiscal_year']} and "
            f"bottomed at {_plain_pct(trough[key])} in {trough['fiscal_year']}."
        )
    else:
        answer += (
            f" The latest year covers {last['fiscal_year']} with "
            f"{_plain_pct(last.get('pat_margin', 0))} PAT margin."
        )

    return _result(
        "trend",
        answer,
        facts=[
            {"label": first["fiscal_year"], "value": formatter(first[key]), "detail": "panel start"},
            {"label": last["fiscal_year"], "value": formatter(last[key]), "detail": "panel end"},
            {
                "label": "Change",
                "value": (
                    f"{change:+.1f} pts"
                    if unit == "percent"
                    else f"{_pct_text(cagr)} CAGR"
                ),
                "detail": f"{periods} years",
            },
            {"label": "Panel", "value": f"{last['companies']} companies", "detail": "balanced"},
        ],
        chart=_chart_line(
            f"{label} · balanced panel",
            [
                {
                    "label": item["fiscal_year"].replace("FY20", "FY"),
                    "value": item[key],
                }
                for item in series
            ],
            [{"key": "value", "label": label}],
            unit=unit,
        ),
        citations=[_financial_citation(overview, "balanced panel")],
        suggestions=[
            "Which companies beat the universe CAGR?",
            "Show margin trend",
            "Where is risk concentrated?",
        ],
    )


def _coverage_answer(overview: Dict[str, Any]) -> Dict[str, Any]:
    kpis = overview["kpis"]
    coverage = overview["coverage"]
    seed = [record["name"] for record in overview["companies"] if record["data_source"] == "seed"]
    answer = (
        f"The workspace holds {kpis['companies']} companies, {kpis['financial_rows']} "
        f"company-year financial rows ({kpis['first_year']}–{kpis['latest_year']}), "
        f"{kpis['filings']} annual reports across {kpis['pages']:,} pages, and "
        f"{kpis['chunks']:,} retrieval chunks.\n\n"
        f"All {kpis['companies']} companies have at least one filing "
        f"({_plain_pct(kpis['filing_coverage_pct'])} coverage). "
        f"{len(seed)} profiles use the seed fallback: {', '.join(seed) if seed else 'none'}. "
        f"Last refresh: {overview['meta']['last_refresh'] or 'not recorded'}."
    )
    return _result(
        "coverage",
        answer,
        facts=[
            {"label": "Financial rows", "value": str(kpis["financial_rows"]), "detail": f"{kpis['years']} fiscal years"},
            {"label": "Filings", "value": str(kpis["filings"]), "detail": f"{kpis['pages']:,} pages"},
            {"label": "Retrieval chunks", "value": f"{kpis['chunks']:,}", "detail": "TF-IDF index"},
            {"label": "Seed profiles", "value": str(len(seed)), "detail": "approximate"},
        ],
        chart=_chart_bar(
            "Companies with filings by year",
            [
                {"label": row["fiscal_year"], "value": row["companies"]}
                for row in coverage["by_year"]
            ],
            "companies",
            unit="number",
        ),
        citations=[_financial_citation(overview), _filings_citation(overview)],
        suggestions=[
            "Which companies have the most filings?",
            "How fresh is the data?",
            "Which profiles use seed fallback?",
        ],
    )


def _clean_excerpt(text: str, limit: int = 260) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rsplit(" ", 1)[0] + "…"


def _filings_answer(
    record: Dict[str, Any],
    overview: Dict[str, Any],
    filing_hits: List[Dict[str, Any]],
) -> Dict[str, Any]:
    if not filing_hits:
        result = _company_answer(record, overview)
        result["answer"] += (
            "\n\nFiling search returned no matching passages, so this answer uses "
            "structured financials only."
        )
        return result

    snippets = []
    quoted_hits = []
    for hit in filing_hits:
        if len(snippets) >= 2:
            break
        excerpt = _clean_excerpt(hit.get("excerpt", ""))
        if excerpt:
            snippets.append(
                f"“{excerpt}” — {hit.get('doc_title', 'Filing')}, p.{hit.get('page', '?')}"
            )
            quoted_hits.append(hit)
    answer = (
        f"For {record['name']}, filings surface these passages:\n\n"
        + "\n\n".join(snippets)
        + f"\n\nThe structured view adds {_cr(record['latest_revenue'])} latest revenue, "
        f"{_pct_text(record['revenue_growth_pct'])} growth, and a "
        f"{record['risk_flag']} risk flag."
    )
    citations = []
    seen = set()
    for hit in quoted_hits:
        key = (hit.get("doc_title"), hit.get("page"))
        if key in seen:
            continue
        seen.add(key)
        citations.append(_hit_citation(hit))
    citations.append(_financial_citation(overview, record["name"]))

    return _result(
        "filings",
        answer,
        facts=[
            {"label": "Filing passages", "value": str(len(snippets)), "detail": "matched excerpts"},
            {"label": "Revenue", "value": _cr(record["latest_revenue"]), "detail": record["latest_year"]},
            {"label": "Growth", "value": _pct_text(record["revenue_growth_pct"]), "detail": "year on year"},
            {"label": "Risk flag", "value": record["risk_flag"], "detail": "rule-based"},
        ],
        citations=citations,
        suggestions=[
            f"How does {record['name']} compare with its sector?",
            f"Show {record['name']} five-year history",
            "Where is risk concentrated?",
        ],
        company_id=record["id"],
    )


def _unsupported_answer(overview: Dict[str, Any]) -> Dict[str, Any]:
    kpis = overview["kpis"]
    answer = (
        "That data is not in this workspace, so I won't guess. Capital Screener covers "
        f"{kpis['companies']} BSE-listed SMEs with {kpis['financial_rows']} financial rows "
        f"and {kpis['filings']} filings. Share prices, valuation multiples, news, and "
        "buy/sell recommendations are outside the committed dataset.\n\n"
        "Ask me about revenue, growth, margins, leverage, risk flags, sector mix, "
        "or filing coverage."
    )
    return _result(
        "abstain",
        answer,
        facts=[
            {"label": "Dataset", "value": f"{kpis['companies']} companies", "detail": f"{kpis['financial_rows']} financial rows"},
            {"label": "Filings", "value": str(kpis["filings"]), "detail": f"{kpis['pages']:,} pages"},
            {"label": "Out of scope", "value": "Prices · news · ratings", "detail": "not committed"},
        ],
        citations=[_financial_citation(overview)],
        suggestions=DEFAULT_SUGGESTIONS,
    )


def answer_question(
    question: str,
    overview: Dict[str, Any],
    history: Optional[List[Dict[str, str]]] = None,
    company_id: Optional[str] = None,
    filing_hits: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    del history  # Reserved for the optional LLM narrative layer.
    question_text = re.sub(r"\s+", " ", (question or "").strip())
    q = question_text.lower()
    records = overview.get("companies", [])
    if not q:
        return _overview_answer(overview)

    if any(term in q for term in UNSUPPORTED_TERMS):
        return _unsupported_answer(overview)

    matches = (
        [record for record in records if record["id"] == company_id]
        if company_id
        else _match_companies(q, records)
    )
    sectors = _match_sectors(q, overview.get("sectors", []))

    if len(matches) >= 2 and any(term in q for term in ("compare", "vs", "versus", "against")):
        ordered = sorted(matches[:2], key=lambda record: record["latest_revenue"], reverse=True)
        return _compare_answer(ordered, overview)

    if matches and any(term in q for term in FILING_TERMS) and any(
        term in q
        for term in (
            "filing",
            "annual report",
            "strategy",
            "outlook",
            "management",
            "governance",
            "litigation",
            "business model",
            "risk",
        )
    ):
        return _filings_answer(matches[0], overview, filing_hits or [])

    if any(term in q for term in ("trend", "over time", "history", "timeline", "five-year", "5-year")):
        return _trend_answer(overview, q)

    if any(term in q for term in ("risk", "risky", "leverage", "debt", "danger")):
        return _risk_answer(records, overview, q)

    if sectors:
        return _sector_answer(overview, q, sectors)

    if matches:
        return _company_answer(matches[0], overview, filing_hits)

    if any(term in q for term in ("sector", "industry", "industries", "breakdown")):
        return _sector_answer(overview, q, [])

    if any(term in q for term in ("growth", "grow", "fastest", "slowest", "cagr", "momentum", "shrinking")):
        return _rank_answer(records, "growth", overview)

    if any(term in q for term in ("margin", "profitab", "pat", "profit", "ebitda")):
        metric = "ebitda_margin" if "ebitda" in q else "margin"
        return _rank_answer(records, metric, overview)

    if any(term in q for term in ("revenue", "sales", "largest", "biggest", "size", "scale")):
        return _rank_answer(records, "revenue", overview)

    if any(term in q for term in ("score", "rank", "best", "top compan")):
        return _rank_answer(records, "score", overview)

    if any(
        term in q
        for term in ("filing", "coverage", "document", "dataset", "data", "chunk", "page", "refresh")
    ):
        return _coverage_answer(overview)

    if any(term in q for term in ("sector", "industry", "industries", "breakdown")):
        return _sector_answer(overview, q, [])

    return _overview_answer(overview)
