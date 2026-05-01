"""
faster-whisper FastAPI shim.

POST /transcribe  { url, language? } -> { text, language }
GET  /health                         -> { ok: true }

Audio is streamed from `url` (typically an R2 signed GET URL). We use
faster-whisper-large-v3 by default — best multilingual quality including
Swahili. Compute type is float16 for L4/A10/H100; switch to int8 on smaller
cards. Configure via env: WHISPER_MODEL, WHISPER_COMPUTE_TYPE, WHISPER_DEVICE.
"""

import os
import tempfile
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
DEVICE = os.getenv("WHISPER_DEVICE", "cuda")

app = FastAPI(title="nuru-whisper")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)


class TranscribeReq(BaseModel):
    url: str
    language: Optional[str] = "auto"


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(req: TranscribeReq) -> dict:
    if not req.url.startswith(("http://", "https://")):
        raise HTTPException(400, "url must be http(s)")

    with tempfile.NamedTemporaryFile(suffix=".audio", delete=True) as tmp:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("GET", req.url) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(64 * 1024):
                    tmp.write(chunk)
        tmp.flush()

        lang = None if req.language in (None, "auto") else req.language
        segments, info = model.transcribe(tmp.name, language=lang, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments)
        return {"text": text.strip(), "language": info.language}
