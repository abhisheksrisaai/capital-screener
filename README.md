# Capital Screener + Memo Agent

Internal tool for screening 15–20 BSE-listed Indian SMEs, querying filings via RAG, and generating one-page investment memos.

## Live Demo

- **Dashboard:** https://frontend-snowy-two-ft3h1zkq8p.vercel.app
- **API:** https://capital-screener-api.onrender.com/api/health

Render free-tier APIs cold-start; the first request after idle can take ~30 seconds.

## Data honesty

The pipeline **tries Screener.in first**. If a scrape is blocked, returns empty tables, or maps revenue as 0, that company is filled from a **seed profile** derived from public BSE SME filings (approximate). Each company has a `data_source` of `real`, `hybrid`, or `seed`, shown in the dashboard.

Embeddings are **TF-IDF (384-d)**, not sentence-transformers — chosen to stay inside Render's RAM limits. The `EMBEDDING_MODEL` setting documents that choice.

Q&A and memos use Groq with a fallback model chain (`llama-3.1-8b-instant`, then larger models) so a single decommissioned model name does not 500 the demo.

## Architecture

```mermaid
flowchart LR
  subgraph ingest [Ingestion]
    Universe[universe.json]
    Screener[Screener.in]
    PDFs[Annual Report PDFs]
    Parse[PyMuPDF]
    SQL[SQLite]
    Qdrant[Qdrant]
    Universe --> Screener --> SQL
    Universe --> PDFs --> Parse --> Qdrant
  end

  subgraph runtime [Runtime]
    API[FastAPI]
    Groq[Groq LLM]
    React[React Dashboard]
    API --> SQL
    API --> Qdrant
    API --> Groq
    React --> API
  end
```

## Quick Start (Local)

```bash
# Backend
cd backend
cp .env.example .env   # add GROQ_API_KEY
pip install -r requirements.txt
python -m ingest.main  # populate data/processed + Qdrant
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Docker

```bash
export GROQ_API_KEY=your_key
docker compose up --build
```

- API: http://localhost:8000/docs
- Dashboard: http://localhost:5173

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/companies` | List/filter companies |
| `GET /api/companies/{id}` | Company detail + filings |
| `GET /api/companies/{id}/financials` | Time series for charts |
| `GET /api/ranking` | Explainable ranked list |
| `POST /api/companies/{id}/ask` | RAG Q&A with source citations |
| `POST /api/companies/{id}/memo` | Generate investment memo PDF |

## Ranking Logic

Transparent first-pass screen (not investment advice):

```
score = 0.40 × norm(growth) + 0.30 × norm(revenue) + 0.30 × risk_multiplier
```

Risk multipliers: LOW=1.0, MEDIUM=0.6, HIGH=0.2

Risk flags are rule-based:
- **HIGH:** negative growth, debt/equity > 2, or PAT margin declined 2+ years
- **MEDIUM:** growth 0–5% or debt/equity 1–2
- **LOW:** growth > 5% and debt/equity < 1

## Build vs Buy

| Decision | Options | Choice | Why |
|---|---|---|---|
| Vector store | Qdrant vs pgvector | **Qdrant** | Proven in ContractGuard; per-company metadata filtering; no Postgres extension on Render free tier |
| LLM | Groq vs OpenAI | **Groq** | Fast inference, generous free tier, sufficient for Q&A and memo drafts |
| Dashboard | Custom React vs Retool | **Custom React** | Full screening UX control; reuses ContractGuard patterns; no per-seat cost |
| Structured DB | Postgres vs SQLite | **SQLite** | 18-company universe fits file DB; zero infra; Postgres upgrade path documented |
| Data source | Mock vs real | **Screener first, seed fallback** | Live scrape is the happy path; committed JSON + seed profiles keep the demo up when Screener/BSE block CI |

## Data Refresh

GitHub Action (`.github/workflows/data_refresh.yml`) runs weekdays at 02:00 UTC or on manual dispatch. It re-scrapes Screener.in, downloads PDFs, and commits `data/processed/` artifacts.

## Eval & Numbers

Full method in [`EVAL.md`](EVAL.md). Measured 2026-09-13 (scripts in `evals/`):

| Metric | Value | How measured |
|---|---|---|
| Docs ingested | 38 filings / 1260 chunks / 18 companies (16 real, 2 seed) | `evals/metrics.py` over `data/processed/` |
| Financial rows | 90 (FY2020–FY2026) | `financials.json` count |
| Retrieval latency | avg 4.69 ms, p95 4.79 ms | 30 qa_set queries, local TF-IDF + Qdrant (excludes Groq generation) |
| Cost per query | approx. $0.000040 at list pricing; observed $0 (Groq free tier) | ~554 measured input tokens × $0.05/1M in + ~150 out × $0.08/1M |
| Refresh time | avg 4.5 min over last 6 scheduled runs (all green) | GitHub Actions history |
| Citation precision | 0.60 overall — factual 10/10, numerical 2/10, cross-year 6/10 | `evals/eval_citation.py`, page-level match |

Known gap: number questions against the two long real PDFs miss, because TF-IDF ranks overview pages when the target figure is not in the query. CI gate (≥ 0.50) locks current behavior; planned fix is SQL-first routing for number questions.

## Failure Cases

Two real bugs, both visible in commit history:

1. **Seed PDFs extracted as unreadable text.** Generated filings came out of PyMuPDF as mojibake/empty, so RAG chunks — and therefore Q&A citations — were garbage.
   Changed: fixed the text-encoding path in the seed PDF writer, and split each filing into one page per section (overview / performance / risks / governance) so risk passages retrieve independently.
   Before: excerpts unreadable. After: clean section-aligned chunks, verifiable in `chunks_manifest.json`.

2. **A decommissioned Groq model name 500'd the demo.** `ask` and `memo` hard-depended on one model; when Groq retired it, every answer failed.
   Changed: `FALLBACK_MODELS` chain in `backend/app/services/llm_service.py` (`llama-3.1-8b-instant` → larger fallbacks) plus a `max_tokens` / `max_completion_tokens` compatibility shim.
   Before: any model retirement = 500s. After: degrades across models; 503 only if all fail.

## Data Contract

| Area | Contract |
|---|---|
| Input schema | `data/config/universe.json` → per company per year: `revenue`, `ebitda`, `pat`, `debt_to_equity` (Rs crore, ratios). Scrape-first; seed-profile fallback when scrape is blocked or maps revenue as 0. |
| Provenance | Every company carries `data_source`: `real`, `hybrid`, or `seed`, surfaced in the dashboard. |
| Missing year data | Endpoints return available years sorted ascending; ranking uses the latest year only. Out-of-range years are eval-covered: the model must abstain (`evals/qa_set.jsonl` unanswerables). |
| Refresh failure | Zero-revenue guard refuses the commit when > 3 companies report Rs 0. Any job failure auto-files a GitHub issue with the run link (`File issue on refresh failure` step). |

## Project Structure

```
capital-screener/
├── backend/          # FastAPI + ingest pipeline
├── frontend/         # React dashboard
├── data/
│   ├── config/       # Company universe
│   └── processed/    # Committed structured JSON + chunk manifest
└── docker-compose.yml
```

## Deployment

### Render (Backend)

1. Connect GitHub repo
2. Use `render.yaml` blueprint
3. Set `GROQ_API_KEY` secret
4. Update `FRONTEND_URL` after Vercel deploy

### Vercel (Frontend)

1. Import repo, set **Root Directory** to `frontend/` (so `frontend/vercel.json` SPA rewrites apply)
2. Set env `VITE_API_URL=https://capital-screener-api.onrender.com`
3. Deploy

## License

MIT
