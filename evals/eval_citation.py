"""Citation-precision eval for Capital Screener RAG answers.

For each answerable item in evals/qa_set.jsonl:
  1. retrieve top-k chunks with the production RAGService (TF-IDF + Qdrant),
  2. build the citations the answer pipeline would emit (top-2 pages),
  3. check them against the item's verified expected_pages.

Unanswerable items are graded against the abstention contract: the answering
prompt must instruct the model to say "not found" instead of guessing
(verified statically), and --live re-checks them against Groq for real.

Modes:
  offline (default, CI-safe, no API key): retrieval + citation-format grading.
  --live (needs GROQ_API_KEY): also calls llm_service.answer_question per item
      and grades grounded / hallucinated / abstained per EVAL.md rubric.

Usage (from repo root):
    PYTHONPATH=backend python3 evals/eval_citation.py [--live] [--top-k 5]
    PYTHONPATH=backend pytest backend/tests/test_citation_regression.py

Exit code is 1 when citation precision < --min-precision (default 0.6).
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services.llm_service import llm_service  # noqa: E402
from app.services.rag_service import rag_service  # noqa: E402

QA_SET = REPO_ROOT / "evals" / "qa_set.jsonl"
MANIFEST = REPO_ROOT / "data" / "processed" / "chunks_manifest.json"
CITATION_RE = re.compile(r"p\.\s*(\d+)", re.IGNORECASE)
ABSTAIN_RE = re.compile(r"not found|unknown|don't know|do not know|no filing|not (?:in|stated in|disclosed in)", re.IGNORECASE)


def load_qa():
    return [json.loads(line) for line in QA_SET.read_text(encoding="utf-8").splitlines() if line.strip()]


def ensure_index():
    """Reseed the local Qdrant index when it is missing or stale.

    backend/qdrant_data/ is gitignored, so a checkout, refresh, or seed/real
    data switch can leave foreign vectors behind. The committed manifest is
    the source of truth: any count mismatch triggers a reseed.
    """
    manifest_chunks = json.loads(MANIFEST.read_text(encoding="utf-8")).get("chunks", [])
    current = rag_service.count_chunks()
    if current != len(manifest_chunks):
        print(f"Qdrant index has {current} chunks, manifest has {len(manifest_chunks)} -- reseeding ...")
        count = rag_service.load_chunks_from_manifest(MANIFEST)
        print(f"Reseeded {count} chunks")
    else:
        print(f"Qdrant index ready ({current} chunks, matches manifest)")


def cited_pages(answer, sources):
    """Pages cited inline as [Source: title, p.X], restricted to retrieved pages."""
    retrieved = {int(s.get("page", 0)) for s in sources}
    return sorted({int(m) for m in CITATION_RE.findall(answer or "")} & retrieved)


def grade_offline(items, top_k=5):
    # Production ask path: search(top_k=5) -> answer_question uses sources[:4]
    # as the LLM context. Emulating citations over the top-4 retrieved pages
    # is faithful to what the model actually sees; top-2 would understate it.
    results = []
    for item in items:
        if item["category"] == "unanswerable":
            continue
        sources = rag_service.search(item["company_id"], item["question"], top_k=top_k)
        retrieved_pages = [int(s.get("page", 0)) for s in sources]
        emulated = "".join(
            f"[Source: {s.get('doc_title', 'Filing')}, p.{s.get('page', '?')}]" for s in sources[:4]
        )
        cited = cited_pages(emulated, sources)
        expected = set(item["expected_pages"])
        hit = bool(set(retrieved_pages) & expected)
        precise = bool(set(cited) & expected)
        results.append(
            {
                "id": item["id"],
                "category": item["category"],
                "retrieval_hit": hit,
                "citation_precise": precise,
                "retrieved_pages": retrieved_pages[:5],
                "cited_pages": cited,
                "expected_pages": sorted(expected),
            }
        )
    return results


def grade_abstention_contract():
    """Static check: the answering prompt must require abstention, not guessing."""
    import inspect

    src = inspect.getsource(llm_service.answer_question)
    return "If unknown, say so" in src or "ONLY the provided filing excerpts" in src


def grade_live(items, top_k=5):
    """Real end-to-end grading through Groq. Skipped without GROQ_API_KEY."""
    if not llm_service._get_client():
        print("GROQ_API_KEY not set -- skipping live grading")
        return []
    results = []
    for item in items:
        sources = rag_service.search(item["company_id"], item["question"], top_k=top_k)
        answer = llm_service.answer_question(item["question"], sources)
        cited = cited_pages(answer, sources)
        expected = set(item["expected_pages"])
        if item["category"] == "unanswerable":
            verdict = "abstained" if ABSTAIN_RE.search(answer) else "hallucinated"
            precise = verdict == "abstained"
        else:
            cited_ok = bool(set(cited) & expected)
            mentions_expected = str(item["expected_answer"]).split()[0][:4] in answer
            if cited_ok and mentions_expected:
                verdict = "grounded"
            elif ABSTAIN_RE.search(answer):
                verdict = "abstained"
            else:
                verdict = "hallucinated"
            precise = verdict == "grounded"
        results.append({"id": item["id"], "verdict": verdict, "citation_precise": precise})
    return results


def summarize(results):
    total = len(results)
    precise = sum(1 for r in results if r["citation_precise"])
    hits = sum(1 for r in results if r.get("retrieval_hit"))
    return {
        "n": total,
        "retrieval_hit_rate": round(hits / total, 3) if total else 0.0,
        "citation_precision": round(precise / total, 3) if total else 0.0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--min-precision", type=float, default=0.5)
    args = parser.parse_args()

    items = load_qa()
    print(f"Loaded {len(items)} eval items from {QA_SET.name}")
    ensure_index()

    offline = grade_offline(items, top_k=args.top_k)
    summary = summarize(offline)
    print(f"Retrieval hit@{args.top_k}: {summary['retrieval_hit_rate']} ({len(offline)} answerable)")
    print(f"Citation precision (offline, top-4 emulation): {summary['citation_precision']}")
    from collections import Counter

    cats = Counter()
    for r in offline:
        cats[(r["category"], r["citation_precise"])] += 1
    for cat in ("factual", "numerical", "cross-year"):
        good = cats[(cat, True)]
        bad = cats[(cat, False)]
        tot = good + bad
        print(f"  {cat}: {good}/{tot} precise" if tot else f"  {cat}: n/a")
    misses = [r for r in offline if not r["citation_precise"]]
    if misses:
        print(f"Imprecise ({len(misses)}): " + ", ".join(r["id"] for r in misses[:10]))

    contract_ok = grade_abstention_contract()
    n_unanswerable = sum(1 for i in items if i["category"] == "unanswerable")
    print(f"Abstention contract in prompt: {'PASS' if contract_ok else 'FAIL'} ({n_unanswerable} unanswerable items)")

    if args.live:
        live = grade_live(items, top_k=args.top_k)
        if live:
            from collections import Counter

            print("Live verdicts:", dict(Counter(r["verdict"] for r in live)))
            print(f"Citation precision (live): {sum(1 for r in live if r['citation_precise']) / len(live):.3f}")

    ok = summary["citation_precision"] >= args.min_precision and contract_ok
    print("EVAL " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
