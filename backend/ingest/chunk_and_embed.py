"""Embed filing chunks into Qdrant and write manifest."""

import json
from pathlib import Path
from typing import Any, Dict, List

from app.services.rag_service import rag_service
from ingest.utils import repo_root


def embed_chunks(chunks: List[Dict[str, Any]]) -> int:
    if not chunks:
        return 0
    corpus = [c["text"] for c in chunks]
    count = rag_service.upsert_chunks(chunks, corpus=corpus)

    manifest_path = repo_root() / "data" / "processed" / "chunks_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({"chunks": chunks}, indent=2), encoding="utf-8")
    return count
