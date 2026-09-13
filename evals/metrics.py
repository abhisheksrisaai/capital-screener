"""Compute real README/EVAL numbers from actual data, DB, and local runs.

Measures (no invented numbers):
  - corpus: companies, filings, chunks, financial rows, real/seed mix
  - sqlite: row counts in backend/data/screener.db (when present)
  - retrieval latency: avg + p95 of rag_service.search over the 30
    answerable qa_set items against the manifest-seeded local index
  - re-embed time: full rebuild of the 1260-chunk local index
  - context size: avg chars of the top-4 excerpts fed to Groq per question
  - cost per query: derived from measured context size at Groq list pricing
    for llama-3.1-8b-instant ($0.05/1M input, $0.08/1M output tokens,
    Helicone pricing index, Sep 2026) assuming ~150 output tokens and
    ~4 chars/token. Labeled approx. -- observed spend is $0 (free tier).

Usage (from repo root):
    PYTHONPATH=backend python3 evals/metrics.py
Writes evals/metrics.json and prints a markdown table for the README.
"""

import json
import math
import sqlite3
import statistics
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services.rag_service import rag_service  # noqa: E402

PROCESSED = REPO_ROOT / "data" / "processed"
QA_SET = REPO_ROOT / "evals" / "qa_set.jsonl"
MANIFEST = PROCESSED / "chunks_manifest.json"

INPUT_PER_1M = 0.05
OUTPUT_PER_1M = 0.08


def main():
    companies = json.loads((PROCESSED / "companies.json").read_text())["companies"]
    filings = json.loads((PROCESSED / "filings.json").read_text())["filings"]
    financials = json.loads((PROCESSED / "financials.json").read_text())["financials"]
    manifest_chunks = json.loads(MANIFEST.read_text()).get("chunks", [])
    items = [json.loads(l) for l in QA_SET.read_text().splitlines() if l.strip()]
    answerable = [i for i in items if i["category"] != "unanswerable"]

    out = {
        "companies": len(companies),
        "filings": len(filings),
        "chunks": len(manifest_chunks),
        "financial_rows": len(financials),
        "real_sources": sum(1 for c in companies if c.get("data_source") == "real"),
        "seed_sources": sum(1 for c in companies if c.get("data_source") != "real"),
        "qa_items": len(items),
    }

    db_path = REPO_ROOT / "backend" / "data" / "screener.db"
    if db_path.exists():
        con = sqlite3.connect(str(db_path))
        for table in ("companies", "financials", "filings"):
            try:
                out[f"db_{table}"] = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.Error:
                out[f"db_{table}"] = None
        con.close()
    else:
        out["db_note"] = "backend/data/screener.db not present (gitignored build artifact)"

    # Re-embed timing: full local index rebuild from the committed manifest.
    t0 = time.perf_counter()
    rebuilt = rag_service.load_chunks_from_manifest(MANIFEST)
    out["reembed_seconds"] = round(time.perf_counter() - t0, 1)
    out["rebuilt_chunks"] = rebuilt

    # Retrieval latency + context size over the answerable eval set.
    lat, ctx_chars = [], []
    for item in answerable:
        t0 = time.perf_counter()
        sources = rag_service.search(item["company_id"], item["question"], top_k=5)
        lat.append(time.perf_counter() - t0)
        ctx_chars.append(sum(len(s.get("excerpt", "")) for s in sources[:4]))
    lat_ms = [round(v * 1000, 2) for v in lat]
    out["retrieval_avg_ms"] = round(statistics.mean(lat_ms), 2)
    out["retrieval_p95_ms"] = round(sorted(lat_ms)[max(0, math.ceil(len(lat_ms) * 0.95) - 1)], 2)
    out["retrieval_n"] = len(lat_ms)
    out["avg_context_chars"] = int(statistics.mean(ctx_chars))

    in_tokens = out["avg_context_chars"] / 4 + 150  # context + prompt overhead, approx
    out["approx_input_tokens_per_query"] = int(in_tokens)
    out["approx_cost_per_query_usd"] = round(in_tokens / 1e6 * INPUT_PER_1M + 150 / 1e6 * OUTPUT_PER_1M, 6)

    (REPO_ROOT / "evals" / "metrics.json").write_text(json.dumps(out, indent=2))

    print("# metrics (measured, see evals/metrics.py)")
    print(f"- docs ingested: {out['filings']} filings / {out['chunks']} chunks / "
          f"{out['companies']} companies ({out['real_sources']} real, {out['seed_sources']} seed)")
    print(f"- financial rows: {out['financial_rows']}")
    print(f"- retrieval latency (local TF-IDF+Qdrant, n={out['retrieval_n']}): "
          f"avg {out['retrieval_avg_ms']}ms, p95 {out['retrieval_p95_ms']}ms (excludes Groq generation)")
    print(f"- local re-embed of {out['rebuilt_chunks']} chunks: {out['reembed_seconds']}s")
    print(f"- avg Groq context: ~{out['approx_input_tokens_per_query']} input tokens "
          f"-> approx ${out['approx_cost_per_query_usd']:.6f}/query at list pricing "
          f"(observed spend $0, free tier)")
    if "db_companies" in out:
        print(f"- sqlite rows: companies={out['db_companies']}, "
              f"financials={out.get('db_financials')}, filings={out.get('db_filings')}")


if __name__ == "__main__":
    main()
