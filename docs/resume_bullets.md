# Capital Screener — resume bullets (paste into one-page CV)

## Headline project (place first under Projects)

**Capital Screener + Memo Agent** — private-markets research tool  
Live: https://capital-screener-emp27.vercel.app  
GitHub: https://github.com/abhisheksrisaai/capital-screener  
Stack: FastAPI · React · SQLite · Qdrant · Groq RAG · GitHub Actions

- Built an internal screening dashboard over 18 BSE-listed SMEs: ingest filings/financials, filter/rank companies with an explainable growth-and-risk score, RAG Q&A over filings with source citations, and one-page AI investment memos.
- Designed a batch pipeline (Screener.in + PDF parse → SQLite + Qdrant) with scheduled GitHub Actions refresh, seed fallback when scrapers are blocked, Dockerized FastAPI on Render, and React on Vercel.

## Suggested one-line for ContractGuard (to keep the page to one sheet)

- Built clause-level contract risk analysis with RAG Q&A and PDF reports; deployed on Docker, Render, and Vercel.
