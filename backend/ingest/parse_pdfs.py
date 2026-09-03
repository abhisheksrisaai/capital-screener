"""Parse PDFs into page-aware chunks."""

from pathlib import Path
from typing import Any, Dict, List

from app.services.pdf_extractor import chunk_pages, extract_pages
from ingest.utils import repo_root


def parse_all_filings(filings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    all_chunks: List[Dict[str, Any]] = []

    for filing in filings:
        pdf_path = repo_root() / filing["pdf_path"]
        if not pdf_path.exists():
            print(f"  Missing PDF: {pdf_path}")
            continue

        print(f"  Parsing {pdf_path.name}")
        pages = extract_pages(pdf_path)
        chunks = chunk_pages(pages)
        for chunk in chunks:
            all_chunks.append(
                {
                    "company_id": filing["company_id"],
                    "filing_year": filing["fiscal_year"],
                    "doc_title": filing["title"],
                    "page": chunk["page"],
                    "chunk_index": chunk["chunk_index"],
                    "text": chunk["text"],
                }
            )

    return all_chunks
