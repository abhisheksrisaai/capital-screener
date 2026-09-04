import pytest

from app.services.ranking_service import rank_companies
from ingest.utils import clean_doc_title, extract_fiscal_year, parse_number, _lookup_row, _norm_label
from ingest.seed_profiles import PROFILES, build_financials, build_filing_text, build_filing_sections
from ingest.compute_metrics import compute_risk_flag


def test_parse_number_parentheses_negative():
    assert parse_number("(12.5)") == -12.5
    assert parse_number("1,234.0") == 1234.0


def test_extract_fiscal_year_from_nse_title():
    assert extract_fiscal_year("Annual Report 2025-26 from nse", "FY2024") == "FY2025"
    assert clean_doc_title("Annual Report 2026from nse") == "Annual Report 2026"


def test_screener_label_lookup():
    rows = {"Sales +": {"Mar 2024": 100.0}, "Net Profit +": {"Mar 2024": 10.0}}
    assert _lookup_row(rows, "sales")["Mar 2024"] == 100.0
    assert _norm_label("Sales +") == "sales"


def test_seed_growth_varies_by_company():
    mac = build_financials("macpower", PROFILES["macpower"])
    sbal = build_financials("sbal", PROFILES["sbal"])
    mac_g = (mac[-1]["revenue"] - mac[-2]["revenue"]) / mac[-2]["revenue"] * 100
    sbal_g = (sbal[-1]["revenue"] - sbal[-2]["revenue"]) / sbal[-2]["revenue"] * 100
    assert mac_g > 10
    assert sbal_g < 0


def test_seed_filings_cover_risks_and_outlook():
    company = {"id": "macpower", "name": "Macpower CNC Machines Ltd", "sector": "Capital Goods", "bse_code": "543763"}
    text = build_filing_text(company, "FY2024")
    sections = build_filing_sections(company, "FY2024")
    assert "key business risks" in text.lower()
    assert "Directors" in text
    assert "outlook" in text.lower()
    assert len(sections) == 4
    assert "Key business risks" in sections[2]


def test_ranking_is_explainable():
    ranked = rank_companies([
        {"id": "a", "latest_revenue": 100, "revenue_growth_pct": 20, "risk_flag": "LOW"},
        {"id": "b", "latest_revenue": 10, "revenue_growth_pct": -5, "risk_flag": "HIGH"},
    ])
    assert ranked[0]["id"] == "a"
    assert "growth_contrib" in ranked[0]["breakdown"]
    assert ranked[0]["score"] > ranked[1]["score"]


def test_risk_flag_high_on_negative_growth():
    company = {"id": "x", "revenue_growth_pct": -2}
    fins = [{"company_id": "x", "fiscal_year": "FY2024", "revenue": 100, "pat": 10, "debt_to_equity": 0.4}]
    assert compute_risk_flag(company, fins) == "HIGH"
