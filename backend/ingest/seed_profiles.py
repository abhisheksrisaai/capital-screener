"""Realistic company financial profiles for seeding when live scrape is unavailable."""

from typing import Any, Dict, List

# Revenue in Cr, growth patterns, debt/equity — based on public BSE SME filings (approximate)
PROFILES: Dict[str, Dict[str, Any]] = {
    "macpower": {"base_revenue": 145.0, "growth": 18.5, "de_ratio": 0.45, "margin": 0.12},
    "ganecos": {"base_revenue": 890.0, "growth": 12.3, "de_ratio": 0.82, "margin": 0.08},
    "gandhitube": {"base_revenue": 312.0, "growth": 8.7, "de_ratio": 0.55, "margin": 0.10},
    "krishnadef": {"base_revenue": 198.0, "growth": 32.1, "de_ratio": 0.38, "margin": 0.14},
    "softtech": {"base_revenue": 78.0, "growth": 15.2, "de_ratio": 0.22, "margin": 0.18},
    "sbal": {"base_revenue": 425.0, "growth": -3.2, "de_ratio": 1.85, "margin": 0.05},
    "jayagrogn": {"base_revenue": 520.0, "growth": 6.8, "de_ratio": 0.65, "margin": 0.09},
    "shivalik": {"base_revenue": 165.0, "growth": 22.4, "de_ratio": 0.48, "margin": 0.11},
    "dynemic": {"base_revenue": 235.0, "growth": 4.1, "de_ratio": 1.12, "margin": 0.07},
    "nibe": {"base_revenue": 112.0, "growth": 28.6, "de_ratio": 0.31, "margin": 0.16},
    "orientbell": {"base_revenue": 680.0, "growth": 9.5, "de_ratio": 0.72, "margin": 0.06},
    "hpl": {"base_revenue": 1240.0, "growth": 11.2, "de_ratio": 0.88, "margin": 0.05},
    "kriti": {"base_revenue": 385.0, "growth": 7.3, "de_ratio": 0.95, "margin": 0.08},
    "manaksia": {"base_revenue": 920.0, "growth": -1.5, "de_ratio": 2.15, "margin": 0.04},
    "sanghi": {"base_revenue": 1580.0, "growth": 5.2, "de_ratio": 1.45, "margin": 0.03},
    "tirupati": {"base_revenue": 88.0, "growth": 24.8, "de_ratio": 0.52, "margin": 0.13},
    "vishnu": {"base_revenue": 445.0, "growth": 14.6, "de_ratio": 0.58, "margin": 0.10},
    "automotive": {"base_revenue": 156.0, "growth": 3.8, "de_ratio": 1.35, "margin": 0.06},
}


def build_financials(company_id: str, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = []
    growth = profile.get("growth", 8.0) / 100.0
    latest = float(profile["base_revenue"])
    years = list(range(2020, 2025))
    revenues = [latest]
    for _ in range(len(years) - 1):
        prev = revenues[0] / (1 + growth) if growth > -0.99 else revenues[0]
        revenues.insert(0, round(prev, 2))
    revenues[-1] = latest
    for i, year in enumerate(years):
        revenue = round(revenues[i], 2)
        margin = profile["margin"] * (0.9 + i * 0.02)
        pat = round(revenue * margin, 2)
        ebitda = round(pat * 1.8, 2)
        rows.append(
            {
                "fiscal_year": f"FY{year}",
                "revenue": revenue,
                "pat": pat,
                "ebitda": ebitda,
                "debt_to_equity": profile["de_ratio"],
            }
        )
    return rows


def build_filing_text(company: Dict[str, Any], fiscal_year: str) -> str:
    profile = PROFILES.get(company["id"], {})
    growth = profile.get("growth", 8.0)
    de_ratio = profile.get("de_ratio", 0.8)
    revenue = profile.get("base_revenue", 100.0)
    sector = company.get("sector", "industrials")
    outlook = (
        "Management guided for continued volume growth and a measured capex plan."
        if growth >= 8
        else "Management is focused on cost control, working-capital discipline, and restoring growth."
    )
    leverage = (
        "Net leverage remains elevated versus peers; the Board flagged refinancing and interest-cost risk."
        if de_ratio >= 1.0
        else "The balance sheet is conservatively geared, with debt/equity below 1.0x."
    )
    return (
        f"{company['name']} - {fiscal_year} Annual Report (Directors' Report excerpt)\n"
        f"Business overview. The company is a BSE-listed SME in {sector} (scrip {company.get('bse_code', '')}). "
        f"Standalone revenue for the latest reported year was approximately Rs {revenue:.1f} crore. "
        f"Operations remain concentrated in India, with a mix of domestic OEM/institutional demand and limited exports.\n"
        f"Performance and outlook. Year-on-year revenue growth was about {growth:.1f}%. {outlook} "
        f"Capacity utilization and order-book conversion were cited as the main near-term drivers. "
        f"The Board's stated priorities for the next fiscal year are capital allocation, working-capital turns, and product-mix improvement.\n"
        f"Key business risks. Material risks disclosed by management include: (1) raw-material and commodity price volatility in {sector}; "
        f"(2) working-capital cycles and receivable delays from institutional customers; (3) regulatory and compliance changes applicable to listed SMEs; "
        f"(4) customer concentration in a small number of accounts; and (5) FX and input-cost pass-through lag on export orders. {leverage}\n"
        f"Governance. Auditors issued an unmodified opinion on the standalone financial statements. "
        f"Related-party transactions and contingent liabilities are disclosed in the notes to accounts."
    )
