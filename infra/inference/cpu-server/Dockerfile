FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    TRANSFORMERS_CACHE=/models

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.6.0 \
  && pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8101
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8101", "--workers", "1"]
