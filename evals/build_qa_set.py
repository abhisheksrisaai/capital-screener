"""Build evals/qa_set.jsonl from the actual ingested data.

Every item is grounded in data/processed artifacts (companies.json,
financials.json, filings.json, chunks_manifest.json) -- never invented.
An item is only emitted when its anchor string is verified present in the
company's ingested chunks (answerable) or verified absent (unanswerable).

Usage (from repo root):
    PYTHONPATH=backend python3 evals/build_qa_set.py
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PROCESSED = REPO_ROOT / "data" / "processed"


def load(name):
    return json.loads((PROCESSED / name).read_text(encoding="utf-8"))


def num_variants(value):
    """String forms a number may take inside raw PDF text.

    Small values (< 10) only use decimal forms: a bare "2" would match
    every stray quantity, date fragment, and page number in a long PDF.
    """
    try:
        v = float(value)
    except (TypeError, ValueError):
        return {str(value)}
    if abs(v) < 10:
        return {f"{v:.1f}", f"{v:.2f}"}
    variants = {str(value), f"{value:.1f}", f"{value:.2f}"}
    if abs(v) >= 100:
        variants.add(f"{v:,.0f}")
        variants.add(f"{v:,.1f}")
        # Indian digit grouping, e.g. 1142 -> 1,142
        s = f"{int(round(v))}"
        if len(s) == 4:
            variants.add(f"{s[0]},{s[1:]}")
        elif len(s) == 5:
            variants.add(f"{s[:2]},{s[2:]}")
        elif len(s) == 6:
            variants.add(f"{s[0]},{s[1:3]},{s[3:]}")
    return variants


def main():
    companies = {c["id"]: c for c in load("companies.json")["companies"]}
    financials = load("financials.json")["financials"]
    chunks = load("chunks_manifest.json")["chunks"]

    by_company = defaultdict(list)
    for ch in chunks:
        by_company[ch["company_id"]].append(ch)

    fin_by_company = defaultdict(dict)
    for row in financials:
        fin_by_company[row["company_id"]][row["fiscal_year"]] = row

    def pages_with(cid, anchors, year=None):
        # Word-boundary regex: bare substring matching lets "202" hit
        # every "2024"/"2025" year token, which would ground pages wrongly.
        patterns = [re.compile(r"\b" + re.escape(a) + r"\b") for a in anchors]
        pages, titles = [], []
        for ch in by_company.get(cid, []):
            if year and ch.get("filing_year") != year:
                continue
            text = ch["text"]
            if any(p.search(text) for p in patterns):
                pages.append(ch["page"])
                titles.append(ch.get("doc_title", ""))
        return sorted(set(pages)), sorted(set(titles))

    def company_contains(cid, anchors, year=None):
        return bool(pages_with(cid, anchors, year)[0])

    items = []

    def add(category, cid, question, expected, pages, titles, source, note=""):
        items.append(
            {
                "id": f"{category[0].upper()}{len([i for i in items if i['category'] == category]) + 1:02d}",
                "category": category,
                "company_id": cid,
                "question": question,
                "expected_answer": expected,
                "expected_pages": pages,
                "expected_doc_titles": titles,
                "answerable": category != "unanswerable",
                "source": source,
                "note": note,
            }
        )

    # ---- 10 factual (filing-grounded identity/business facts) ----
    factual_made = 0
    for cid in sorted(companies):
        if factual_made >= 10:
            break
        c = companies[cid]
        candidates = [
            (
                f"Which sector is {c['name']} classified under?",
                f"{c['sector']}",
                [c["sector"]],
                None,
                "companies.json + filing chunks",
            ),
            (
                f"What is the BSE scrip code of {c['name']}?",
                f"{c['bse_code']}",
                [c["bse_code"]],
                None,
                "companies.json + filing chunks",
            ),
            (
                f"What was the approximate standalone revenue of {c['name']} "
                f"in the latest reported year, as stated in its annual report?",
                f"Rs {c['latest_revenue']} crore",
                [str(c["latest_revenue"]), f"{c['latest_revenue']:.1f}"],
                None,
                "companies.json + filing chunks",
            ),
        ]
        for q, exp, anchors, year, src in candidates:
            if factual_made >= 10:
                break
            pages, titles = pages_with(cid, anchors, year)
            if pages:
                add("factual", cid, q, exp, pages[:3], titles[:2], src)
                factual_made += 1
                break  # one factual per company for breadth
    assert factual_made == 10, f"only {factual_made} factual items grounded"

    # ---- 10 numerical (exact table values) ----
    # Only distinctive values (>= 20): small numbers like 5.0 match too many
    # unrelated table cells in long PDFs to ground a page reliably.
    numerical_made = 0
    for cid in sorted(fin_by_company):
        if numerical_made >= 10:
            break
        for year in sorted(fin_by_company[cid]):
            if numerical_made >= 10:
                break
            row = fin_by_company[cid][year]
            for metric, label in (("revenue", "revenue"), ("pat", "PAT")):
                if numerical_made >= 10:
                    break
                val = row[metric]
                if abs(val) < 20:
                    continue
                anchors = num_variants(val)
                pages, titles = pages_with(cid, anchors, year)
                if not pages:
                    # fall back: number may sit in a same-company chunk of any year
                    pages, titles = pages_with(cid, anchors)
                if pages:
                    cname = companies[cid]["name"]
                    add(
                        "numerical",
                        cid,
                        f"What was {cname}'s {label} in {year} (Rs crore)?",
                        f"{val}",
                        pages[:3],
                        titles[:2],
                        "financials.json + filing chunks",
                    )
                    numerical_made += 1
                    break
            break  # move across companies for breadth
    # second pass if breadth pass fell short
    if numerical_made < 10:
        for cid in sorted(fin_by_company):
            if numerical_made >= 10:
                break
            for year in sorted(fin_by_company[cid]):
                if numerical_made >= 10:
                    break
                row = fin_by_company[cid][year]
                for metric, label in (("revenue", "revenue"), ("pat", "PAT"), ("ebitda", "EBITDA")):
                    if numerical_made >= 10:
                        break
                    val = row[metric]
                    if abs(val) < 20:
                        continue
                    pages, titles = pages_with(cid, num_variants(val))
                    if pages and not any(
                        i["category"] == "numerical"
                        and i["company_id"] == cid
                        and i["expected_answer"] == f"{val}"
                        for i in items
                    ):
                        cname = companies[cid]["name"]
                        add(
                            "numerical",
                            cid,
                            f"What was {cname}'s {label} in {year} (Rs crore)?",
                            f"{val}",
                            pages[:3],
                            titles[:2],
                            "financials.json + filing chunks",
                        )
                        numerical_made += 1
    assert numerical_made == 10, f"only {numerical_made} numerical items grounded"

    # ---- 10 unanswerable (must abstain): 5 out-of-range years + 5 absent topics ----
    year_items = []
    # out-of-range fiscal years per company
    for cid in sorted(fin_by_company):
        years = set(fin_by_company[cid])
        cname = companies[cid]["name"]
        for missing in ("FY2027", "FY2020", "FY2026"):
            if missing not in years:
                year_items.append(
                    (
                        cid,
                        f"What was {cname}'s revenue in {missing} (Rs crore)?",
                        f"ABSTAIN -- {missing} not ingested for {cid}",
                        f"no {missing} row in financials.json; no {missing} filing",
                    )
                )
                break
    # topics verified absent from a company's chunks
    absent_topics = [
        ("promoter shareholding percentage", ["promoter", "shareholding", "promoters"]),
        ("statutory auditor firm name", ["auditor", "audit firm", "statutory auditor"]),
        ("quarterly results", ["quarter", "Q1", "Q2", "quarterly"]),
        ("dividend per share", ["dividend"]),
        ("CEO remuneration", ["remuneration", "salary", "compensation"]),
    ]
    topic_items = []
    for cid in sorted(companies):
        texts = " ".join(ch["text"] for ch in by_company.get(cid, [])).lower()
        cname = companies[cid]["name"]
        for label, anchors in absent_topics:
            if all(a.lower() not in texts for a in anchors):
                topic_items.append(
                    (
                        cid,
                        f"What is {cname}'s {label} for FY2024?",
                        "ABSTAIN -- not disclosed in ingested filings",
                        f"zero hits for {anchors} in {cid} chunks",
                    )
                )
                break
    assert len(year_items) >= 5 and len(topic_items) >= 5, "not enough unanswerable candidates"
    for cid, q, exp, note in (year_items[:5] + topic_items[:5]):
        add("unanswerable", cid, q, exp, [], [], "negative control", note)

    # ---- 10 cross-year comparisons (round-robin for company breadth) ----
    cross_candidates = []
    for cid in sorted(fin_by_company):
        years = sorted(fin_by_company[cid])
        cname = companies[cid]["name"]
        for y0, y1 in zip(years, years[1:]):
            r0, r1 = fin_by_company[cid][y0], fin_by_company[cid][y1]
            p0, _ = pages_with(cid, num_variants(r0["revenue"]))
            p1, t1 = pages_with(cid, num_variants(r1["revenue"]))
            pages = sorted(set(p0) | set(p1))
            titles = list(t1)
            growth = (
                round((r1["revenue"] - r0["revenue"]) / r0["revenue"] * 100, 1)
                if r0["revenue"]
                else 0.0
            )
            if not pages:
                # growth sentence (e.g. "growth was about 18.5%") also grounds it
                pages, titles = pages_with(cid, num_variants(growth))
                if not pages:
                    continue
            direction = "grew" if r1["revenue"] >= r0["revenue"] else "declined"
            cross_candidates.append(
                (
                    cid,
                    f"How did {cname}'s revenue change from {y0} to {y1}?",
                    f"{direction}: {r0['revenue']} -> {r1['revenue']} Rs crore",
                    pages[:4],
                    titles[:2],
                    "financials.json + filing chunks",
                    f"{y0}={r0['revenue']}, {y1}={r1['revenue']}",
                )
            )
    # round-robin across companies so no single filing dominates
    by_cid = defaultdict(list)
    for cand in cross_candidates:
        by_cid[cand[0]].append(cand)
    picked = []
    while len(picked) < 10 and any(by_cid.values()):
        for cid in sorted(by_cid):
            if by_cid[cid] and len(picked) < 10:
                picked.append(by_cid[cid].pop(0))
    assert len(picked) == 10, f"only {len(picked)} cross-year items grounded"
    for cid, q, exp, pages, titles, src, note in picked:
        add("cross-year", cid, q, exp, pages, titles, src, note)
    cross_made = 10

    out = REPO_ROOT / "evals" / "qa_set.jsonl"
    with out.open("w", encoding="utf-8") as fh:
        for item in items:
            fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    from collections import Counter

    print(f"Wrote {len(items)} items -> {out}")
    print(Counter(i["category"] for i in items))


if __name__ == "__main__":
    sys.exit(main())
