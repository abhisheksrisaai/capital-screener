"""RAG service for filing chunks stored in Qdrant."""

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams

from app.core.config import settings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "filing_chunks"
VECTOR_SIZE = 384
EMBEDDING_VERSION = "tfidf-v1"


class RAGService:
    def __init__(self) -> None:
        self._qdrant: Optional[QdrantClient] = None
        self._vectorizer: Any = None

    @property
    def qdrant(self) -> QdrantClient:
        if self._qdrant is None:
            if settings.QDRANT_MODE == "local":
                local_path = settings.QDRANT_LOCAL_PATH or str(settings.project_root / "qdrant_data")
                Path(local_path).mkdir(parents=True, exist_ok=True)
                self._qdrant = QdrantClient(path=local_path)
            else:
                self._qdrant = QdrantClient(
                    host=settings.QDRANT_HOST,
                    port=settings.QDRANT_PORT,
                    timeout=10.0,
                )
        return self._qdrant

    def _vectorizer_path(self) -> Path:
        base = Path(settings.QDRANT_LOCAL_PATH or settings.project_root / "qdrant_data")
        return base / "filing_tfidf_vectorizer.joblib"

    def _get_or_create_vectorizer(self, corpus: Optional[List[str]] = None):
        from sklearn.feature_extraction.text import TfidfVectorizer
        import joblib

        if self._vectorizer is not None:
            return self._vectorizer

        v_path = self._vectorizer_path()
        if v_path.exists():
            self._vectorizer = joblib.load(str(v_path))
            return self._vectorizer

        if not corpus:
            corpus = ["placeholder filing text for vectorizer initialization"]

        self._vectorizer = TfidfVectorizer(
            max_features=VECTOR_SIZE,
            ngram_range=(1, 2),
            stop_words="english",
            sublinear_tf=True,
        )
        self._vectorizer.fit(corpus)
        v_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self._vectorizer, str(v_path))
        return self._vectorizer

    def generate_embedding(self, text: str, corpus: Optional[List[str]] = None) -> List[float]:
        if not text.strip():
            raise ValueError("Cannot embed empty text")
        vectorizer = self._get_or_create_vectorizer(corpus)
        vec = vectorizer.transform([text]).toarray()[0]
        if len(vec) < VECTOR_SIZE:
            vec = np.pad(vec, (0, VECTOR_SIZE - len(vec)))
        else:
            vec = vec[:VECTOR_SIZE]
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def ensure_collection(self) -> None:
        collections = [c.name for c in self.qdrant.get_collections().collections]
        if COLLECTION_NAME not in collections:
            self.qdrant.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )

    def upsert_chunks(self, chunks: List[Dict[str, Any]], corpus: List[str]) -> int:
        self.ensure_collection()
        points: List[PointStruct] = []
        for i, chunk in enumerate(chunks):
            text = chunk["text"]
            embedding = self.generate_embedding(text, corpus=corpus)
            point_id = chunk.get("point_id") or abs(hash(
                f"{chunk['company_id']}-{chunk.get('filing_year')}-{chunk.get('page')}-{chunk.get('chunk_index')}"
            )) % (2**63 - 1)
            payload = {
                "company_id": chunk["company_id"],
                "filing_year": chunk.get("filing_year", ""),
                "doc_title": chunk.get("doc_title", ""),
                "page": chunk.get("page", 0),
                "chunk_index": chunk.get("chunk_index", 0),
                "text": text[:2000],
            }
            points.append(PointStruct(id=point_id, vector=embedding, payload=payload))

        batch_size = 64
        for start in range(0, len(points), batch_size):
            self.qdrant.upsert(collection_name=COLLECTION_NAME, points=points[start : start + batch_size])
        return len(points)

    def search(self, company_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        self.ensure_collection()
        embedding = self.generate_embedding(query)
        results = self.qdrant.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            query_filter=Filter(
                must=[FieldCondition(key="company_id", match=MatchValue(value=company_id))]
            ),
            limit=top_k,
        )
        hits = []
        for hit in results:
            payload = hit.payload or {}
            hits.append(
                {
                    "score": hit.score,
                    "doc_title": payload.get("doc_title", ""),
                    "page": payload.get("page", 0),
                    "filing_year": payload.get("filing_year", ""),
                    "excerpt": payload.get("text", "")[:400],
                }
            )
        return hits

    def count_chunks(self, company_id: Optional[str] = None) -> int:
        try:
            self.ensure_collection()
            filt = None
            if company_id:
                filt = Filter(must=[FieldCondition(key="company_id", match=MatchValue(value=company_id))])
            result = self.qdrant.count(collection_name=COLLECTION_NAME, count_filter=filt)
            return int(result.count)
        except Exception:
            return 0

    def load_chunks_from_manifest(self, manifest_path: Path) -> int:
        if not manifest_path.exists():
            return 0
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        chunks = data.get("chunks", [])
        if not chunks:
            return 0
        corpus = [c["text"] for c in chunks]
        return self.upsert_chunks(chunks, corpus=corpus)


rag_service = RAGService()
