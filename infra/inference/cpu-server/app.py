"""
CPU-friendly inference service for the Contabo interim host.

This keeps the same HTTP contract used by src/services/inference.ts:

GET  /health
POST /embed        { input }                  -> { embedding }
POST /embed_batch  { input: string[] }        -> { embeddings }
POST /rerank       { query, documents, top_k } -> { results }
POST /transcribe   { url, language? }         -> { text, language }

The long-term production target is still the GPU stack in
infra/inference/docker-compose.yml. This service is for launch readiness on a
CPU VPS until the dedicated GPU box is provisioned.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
from functools import lru_cache
from typing import Optional

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder, SentenceTransformer

logger = logging.getLogger("nuru-inference-cpu")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))
EMBEDDING_DEVICE = os.getenv("EMBEDDING_DEVICE", "cpu")

RERANKER_MODE = os.getenv("RERANKER_MODE", "lexical").lower()
RERANKER_MODEL = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
RERANKER_DEVICE = os.getenv("RERANKER_DEVICE", "cpu")

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

PRELOAD = {
    part.strip().lower()
    for part in os.getenv("INFERENCE_PRELOAD", "embedding,whisper").split(",")
    if part.strip()
}

TOKEN_RE = re.compile(r"[a-z0-9]+")

app = FastAPI(title="nuru-inference-cpu")


class EmbedReq(BaseModel):
    input: str = Field(min_length=1)


class EmbedBatchReq(BaseModel):
    input: list[str]


class RerankReq(BaseModel):
    query: str = Field(min_length=1)
    documents: list[str]
    top_k: int = Field(default=20, ge=1, le=100)


class TranscribeReq(BaseModel):
    url: str
    language: Optional[str] = "auto"


def _normalize_vector(values: np.ndarray) -> list[float]:
    vector = np.asarray(values, dtype=np.float32).reshape(-1)
    if vector.shape[0] != EMBEDDING_DIM:
        raise HTTPException(
            500,
            f"embedding dimension {vector.shape[0]} does not match {EMBEDDING_DIM}",
        )
    return vector.tolist()


@lru_cache(maxsize=1)
def embedder() -> SentenceTransformer:
    logger.info("Loading embedding model %s on %s", EMBEDDING_MODEL, EMBEDDING_DEVICE)
    return SentenceTransformer(EMBEDDING_MODEL, device=EMBEDDING_DEVICE)


@lru_cache(maxsize=1)
def reranker() -> Optional[CrossEncoder]:
    if RERANKER_MODE != "cross-encoder":
        logger.info("Using lexical reranker mode")
        return None
    logger.info("Loading reranker model %s on %s", RERANKER_MODEL, RERANKER_DEVICE)
    return CrossEncoder(RERANKER_MODEL, device=RERANKER_DEVICE)


@lru_cache(maxsize=1)
def whisper() -> WhisperModel:
    logger.info(
        "Loading whisper model %s on %s (%s)",
        WHISPER_MODEL,
        WHISPER_DEVICE,
        WHISPER_COMPUTE_TYPE,
    )
    return WhisperModel(
        WHISPER_MODEL,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE_TYPE,
    )


@app.on_event("startup")
def preload_models() -> None:
    if "embedding" in PRELOAD:
        embedder()
    if "reranker" in PRELOAD:
        reranker()
    if "whisper" in PRELOAD:
        whisper()


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "embedding": embedder.cache_info().currsize > 0,
        "reranker": RERANKER_MODE,
        "whisper": whisper.cache_info().currsize > 0,
        "models": {
            "embedding": EMBEDDING_MODEL,
            "reranker": RERANKER_MODEL if RERANKER_MODE == "cross-encoder" else "lexical",
            "whisper": WHISPER_MODEL,
        },
    }


@app.post("/embed")
def embed(req: EmbedReq) -> dict:
    vector = embedder().encode(req.input, normalize_embeddings=True)
    return {"embedding": _normalize_vector(vector)}


@app.post("/embed_batch")
def embed_batch(req: EmbedBatchReq) -> dict:
    if not req.input:
        return {"embeddings": []}
    vectors = embedder().encode(req.input, normalize_embeddings=True)
    return {"embeddings": [_normalize_vector(vector) for vector in vectors]}


def _tokens(text: str) -> set[str]:
    return set(TOKEN_RE.findall(text.lower()))


def _lexical_rerank(query: str, docs: list[str]) -> list[float]:
    query_tokens = _tokens(query)
    if not query_tokens:
        return [0.0 for _ in docs]

    scores: list[float] = []
    for doc in docs:
        doc_tokens = _tokens(doc)
        if not doc_tokens:
            scores.append(0.0)
            continue
        overlap = len(query_tokens & doc_tokens)
        recall = overlap / len(query_tokens)
        precision = overlap / len(doc_tokens)
        phrase_bonus = 0.1 if query.lower() in doc.lower() else 0.0
        scores.append((0.7 * recall) + (0.3 * precision) + phrase_bonus)
    return scores


@app.post("/rerank")
def rerank_route(req: RerankReq) -> dict:
    if not req.documents:
        return {"results": []}

    model = reranker()
    if model is None:
        scores = _lexical_rerank(req.query, req.documents)
    else:
        pairs = [(req.query, doc) for doc in req.documents]
        scores = [float(score) for score in model.predict(pairs)]

    ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)
    return {
        "results": [
            {"index": index, "score": score}
            for index, score in ranked[: req.top_k]
        ]
    }


@app.post("/transcribe")
async def transcribe(req: TranscribeReq) -> dict:
    if not req.url.startswith(("http://", "https://")):
        raise HTTPException(400, "url must be http(s)")

    with tempfile.NamedTemporaryFile(suffix=".audio", delete=True) as tmp:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("GET", req.url) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes(64 * 1024):
                    tmp.write(chunk)
        tmp.flush()

        language = None if req.language in (None, "auto") else req.language
        segments, info = whisper().transcribe(tmp.name, language=language, beam_size=5)
        text = " ".join(segment.text.strip() for segment in segments)
        return {"text": text.strip(), "language": info.language}
