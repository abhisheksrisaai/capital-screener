"""Prompt-regression gate: citation precision must not silently regress.

Runs the offline eval (no API key needed) against the manifest-seeded local
index and fails the suite when precision drops below the floor documented
in EVAL.md. Run from backend/ (pytest.ini sets pythonpath=.) or repo root:

    cd backend && python -m pytest tests/test_citation_regression.py
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "evals"))

import eval_citation  # noqa: E402

MIN_PRECISION = 0.5


def test_citation_precision_floor():
    items = eval_citation.load_qa()
    assert len(items) == 40, f"qa bank changed size: {len(items)}"
    eval_citation.ensure_index()
    results = eval_citation.grade_offline(items)
    summary = eval_citation.summarize(results)
    assert summary["citation_precision"] >= MIN_PRECISION, (
        f"citation precision regressed to {summary['citation_precision']}: "
        + ", ".join(r["id"] for r in results if not r["citation_precise"])
    )


def test_abstention_contract_present():
    assert eval_citation.grade_abstention_contract(), (
        "answering prompt no longer requires abstention on unknown info"
    )
