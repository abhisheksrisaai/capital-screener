"""PDF text extraction with page-aware chunking."""

import logging
import re
from pathlib import Path
from typing import Dict, List, Union

import fitz

logger = logging.getLogger(__name__)


def extract_pages(pdf_path: Union[str, Path]) -> List[Dict[str, object]]:
    """Extract text per page from a PDF."""
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    pages: List[Dict[str, object]] = []
    with fitz.open(str(path)) as doc:
        for idx, page in enumerate(doc, start=1):
            text = page.get_text("text") or ""
            pages.append({"page": idx, "text": text.strip()})
    return pages


def chunk_pages(
    pages: List[Dict[str, object]],
    chunk_size: int = 500,
    overlap: int = 50,
) -> List[Dict[str, object]]:
    """Split page text into overlapping word-based chunks."""
    chunks: List[Dict[str, object]] = []
    chunk_index = 0

    for page_data in pages:
        page_num = int(page_data["page"])
        words = re.split(r"\s+", str(page_data["text"]))
        words = [w for w in words if w]
        if not words:
            continue

        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            text = " ".join(words[start:end])
            if len(text) > 80:
                chunks.append(
                    {
                        "page": page_num,
                        "chunk_index": chunk_index,
                        "text": text,
                    }
                )
                chunk_index += 1
            if end >= len(words):
                break
            start = max(end - overlap, start + 1)

    return chunks
