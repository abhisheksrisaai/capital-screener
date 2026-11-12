"""Analytics contract: computed numbers and grounded answer behavior."""

import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import pytest

from app.services.analytics_service import answer_question, build_overview

REPO_ROOT = Path(__file__).resolve().parents[2]
PROCESSED = REPO_ROOT / "data" / "processed"


def _load(name):
    return json.loads((PROCESSED / name).read_text(encoding="utf-8"))


def _history(financials):
    rows = defaultdict(list)
    for row in financials:
        rows[row["company_id"]].append(row)
    for company_rows in rows.values():
        company_rows.sort(key=lambda row: row["fiscal_year"])
    return rows


def _latest_revenue(company, rows):
    latest = rows[-1] if rows else {}
    return float(latest.get("revenue") or company.get("latest_revenue") or 0)


def _growth(company, rows):
    value = company.get("revenue_growth_pct")
    if value is not None:
        return float(value)
    if len(rows) < 2:
        return 0.0
    latest = float(rows[-1].get("revenue") or 0)
    prior = float(rows[-2].get("revenue") or 0)
    return ((latest - prior) / prior * 100) if prior else 0.0


def _cr(value):
    return f"₹{value:,.0f} Cr"


@pytest.fixture(scope="module")
def overview():
    companies = _load("companies.json")["companies"]
    financials = _load("financials.json")["financials"]
    filings = _load("filings.json")["filings"]
    manifest = _load("chunks_manifest.json")["chunks"]
    chunks = {
        "by_company": dict(Counter(c["company_id"] for c in manifest)),
        "total": len(manifest),
    }
    return build_overview(
        companies,
        financials,
        filings,
        chunks=chunks,
        refreshed_at="2026-09-14T07:25:49Z",
    )


def test_dataset_counts_match_processed_artifacts(overview):
    companies = _load("companies.json")["companies"]
    financials = _load("financials.json")["financials"]
    filings = _load("filings.json")["filings"]
    manifest = _load("chunks_manifest.json")["chunks"]
    kpis = overview["kpis"]

    assert kpis["companies"] == len(companies)
    assert kpis["sectors"] == len({c.get("sector") or "Unclassified" for c in companies})
    assert kpis["financial_rows"] == len(financials)
    assert kpis["filings"] == len(filings)
    assert kpis["pages"] == sum(int(f.get("page_count") or 0) for f in filings)
    assert kpis["chunks"] == len(manifest)
    assert kpis["filing_coverage_pct"] == 100.0


def test_headline_numbers_are_derived(overview):
    companies = _load("companies.json")["companies"]
    financials = _load("financials.json")["financials"]
    rows = _history(financials)
    kpis = overview["kpis"]

    tracked = sum(_latest_revenue(company, rows.get(company["id"], [])) for company in companies)
    assert kpis["tracked_revenue"] == round(tracked, 1)

    latest = prior = 0.0
    for company in companies:
        company_rows = rows.get(company["id"], [])
        if len(company_rows) < 2:
            continue
        prior_revenue = float(company_rows[-2].get("revenue") or 0)
        if not prior_revenue:
            continue
        latest += float(company_rows[-1].get("revenue") or 0)
        prior += prior_revenue
    assert kpis["like_for_like_growth_pct"] == round((latest - prior) / prior * 100, 2)

    first = overview["balanced_series"][0]
    last = overview["balanced_series"][-1]
    periods = max(1, len(overview["balanced_series"]) - 1)
    assert kpis["latest_revenue"] == last["revenue"]
    assert kpis["latest_reporters"] == last["companies"]
    assert kpis["cagr_pct"] == round(((last["revenue"] / first["revenue"]) ** (1 / periods) - 1) * 100, 2)
    assert kpis["pat_margin_pct"] == last["pat_margin"]

    records = overview["companies"]
    assert kpis["high_risk_count"] == sum(c.get("risk_flag") == "HIGH" for c in companies)
    assert kpis["negative_growth_count"] == sum(
        _growth(company, rows.get(company["id"], [])) < 0 for company in companies
    )
    top_five = sorted((_latest_revenue(c, rows.get(c["id"], [])) for c in companies), reverse=True)[:5]
    assert kpis["top5_share_pct"] == round(sum(top_five) / tracked * 100, 1)
    assert kpis["balanced_companies"] == len(
        {
            company["id"]
            for company in companies
            if all(
                year in {row["fiscal_year"] for row in rows.get(company["id"], [])}
                for year in kpis["balanced_years"]
            )
        }
    )
    assert len(records) == len(companies)


def test_balanced_series_only_uses_full_coverage(overview):
    companies = _load("companies.json")["companies"]
    financials = _load("financials.json")["financials"]
    rows = _history(financials)
    kpis = overview["kpis"]

    coverage = defaultdict(set)
    for row in financials:
        coverage[row["fiscal_year"]].add(row["company_id"])
    threshold = max(3, math.ceil(len(companies) * 0.7))
    expected_years = sorted(
        (year for year in coverage if len(coverage[year]) >= threshold),
        key=lambda year: int(year.replace("FY", "")),
    )
    balanced_ids = {
        company["id"]
        for company in companies
        if all(year in {row["fiscal_year"] for row in rows.get(company["id"], [])} for year in expected_years)
    }

    assert kpis["balanced_years"] == expected_years
    assert kpis["balanced_companies"] == len(balanced_ids)
    assert [row["fiscal_year"] for row in overview["balanced_series"]] == expected_years
    assert all(row["companies"] == len(balanced_ids) for row in overview["balanced_series"])
    for year_row in overview["balanced_series"]:
        expected = sum(
            float(row.get("revenue") or 0)
            for company_id in balanced_ids
            for row in rows[company_id]
            if row["fiscal_year"] == year_row["fiscal_year"]
        )
        assert year_row["revenue"] == round(expected, 1)


def test_sector_and_risk_aggregates(overview):
    companies = _load("companies.json")["companies"]
    financials = _load("financials.json")["financials"]
    rows = _history(financials)
    latest = {
        company["id"]: _latest_revenue(company, rows.get(company["id"], []))
        for company in companies
    }
    sector_revenue = Counter()
    for company in companies:
        sector_revenue[company.get("sector") or "Unclassified"] += latest[company["id"]]
    top_sector, top_revenue = sector_revenue.most_common(1)[0]
    tracked = sum(latest.values())

    sectors = overview["sectors"]
    assert sectors[0]["sector"] == top_sector
    assert sectors[0]["revenue"] == round(top_revenue, 1)
    assert sectors[0]["revenue_share_pct"] == round(top_revenue / tracked * 100, 1)

    risk = overview["risk"]
    expected_counts = Counter(company.get("risk_flag") or "MEDIUM" for company in companies)
    assert risk["counts"] == {flag: expected_counts.get(flag, 0) for flag in ("LOW", "MEDIUM", "HIGH")}
    high_revenue = sum(
        latest[company["id"]] for company in companies if company.get("risk_flag") == "HIGH"
    )
    assert risk["high_risk_revenue_share_pct"] == round(high_revenue / tracked * 100, 1)
    assert len(risk["negative_growth"]) == sum(
        _growth(company, rows.get(company["id"], [])) < 0 for company in companies
    )
    assert len(risk["leverage_outliers"]) == sum(
        bool(rows.get(company["id"])) and float(rows[company["id"]][-1].get("debt_to_equity") or 0) > 0.01
        for company in companies
    )


def test_coverage_matrix_and_provenance(overview):
    coverage = overview["coverage"]
    assert coverage["filing_years"] == ["FY2023", "FY2024", "FY2025", "FY2026"]
    assert len(coverage["companies"]) == 18
    assert all(row["docs"] >= 1 for row in coverage["companies"])
    provenance = {row["source"]: row["count"] for row in overview["provenance"]}
    assert provenance == {"real": 16, "seed": 2}
    assert len(overview["datasets"]) == 4
    assert len(overview["signals"]) >= 4


def test_grounded_answer_contract(overview):
    companies = {company["id"]: company for company in overview["companies"]}
    growth = [company["revenue_growth_pct"] for company in overview["companies"]]
    pages = overview["kpis"]["pages"]
    macpower = companies["macpower"]["latest_revenue"]
    largest = max(companies.values(), key=lambda company: company["latest_revenue"])
    top_margin_sector = max(overview["sectors"], key=lambda sector: sector["pat_margin"])

    cases = [
        ("Which companies grew fastest?", "growth", f"{max(growth):+.1f}%"),
        (
            "Where is risk concentrated?",
            "risk",
            f"{overview['risk']['high_risk_revenue_share_pct']:.1f}%",
        ),
        ("Compare Macpower and Krishna Defence", "compare", _cr(macpower)),
        (
            "How did PAT margins trend?",
            "trend",
            f"{overview['balanced_series'][0]['pat_margin']:.1f}%",
        ),
        (
            "Which sector has the highest margin?",
            "sector",
            top_margin_sector["sector"],
        ),
        ("How many filings do we have?", "coverage", f"{pages:,} pages"),
        ("What is the revenue of Macpower?", "company", _cr(macpower)),
        ("What is the largest company by revenue?", "revenue", _cr(largest["latest_revenue"])),
    ]

    for question, intent, needle in cases:
        result = answer_question(question, overview)
        assert result["intent"] == intent
        assert needle in result["answer"], f"{question}: expected {needle!r} in {result['answer']!r}"
        assert result["facts"], "answers must expose computed facts"
        assert result["citations"], "answers must cite a dataset"
        assert result["suggestions"]
        assert result["meta"]["engine"] == "structured"


def test_universe_question_abstains_on_out_of_scope_data(overview):
    result = answer_question("What is the share price of Macpower?", overview)
    assert result["intent"] == "abstain"
    assert "won't guess" in result["answer"]
    assert "Share prices" in result["answer"]
    assert result["chart"] is None


def test_unknown_question_falls_back_to_overview(overview):
    result = answer_question("Give me the lay of the land", overview)
    assert result["intent"] == "overview"
    assert f"{overview['kpis']['companies']} BSE-listed companies" in result["answer"]


def test_filing_citations_match_quoted_excerpts(overview):
    hits = [
        {
            "doc_title": "Annual Report 2025",
            "page": 88,
            "excerpt": "The Company maintains a risk register covering demand, input costs and execution.",
        },
        {
            "doc_title": "Annual Report 2026",
            "page": 113,
            "excerpt": "Contingent liabilities relate to ongoing tax and legal proceedings.",
        },
        {
            "doc_title": "Annual Report 2024",
            "page": 90,
            "excerpt": "A third passage should not be cited when only two are quoted.",
        },
        {
            "doc_title": "Annual Report 2023",
            "page": 75,
            "excerpt": "",
        },
    ]
    result = answer_question(
        "What risks do Macpower filings mention?",
        overview,
        filing_hits=hits,
    )
    assert result["intent"] == "filings"
    filing_citations = [citation for citation in result["citations"] if citation["kind"] == "filing"]
    assert len(filing_citations) == 2
    assert {citation["label"] for citation in filing_citations} == {
        "Annual Report 2025",
        "Annual Report 2026",
    }
