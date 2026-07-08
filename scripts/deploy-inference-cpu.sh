#!/usr/bin/env bash
set -euo pipefail

# Deploy interim CPU inference on the Contabo VPS.
#
# Run on the VPS as root after pulling main:
#   scripts/deploy-inference-cpu.sh

APP_DIR="${APP_DIR:-/opt/nuru/app}"
APP_USER="${APP_USER:-nuru}"
APP_GROUP="${APP_GROUP:-nuru}"
API_ENV="${API_ENV:-/etc/nuru/api.env}"
SERVICE_NAME="${SERVICE_NAME:-nuru-inference-cpu}"
VENV_DIR="${VENV_DIR:-/opt/nuru/inference-cpu/.venv}"
MODEL_CACHE="${MODEL_CACHE:-/opt/nuru/model-cache}"
PORT="${PORT:-8101}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ "$(id -u)" -ne 0 ]; then
  echo "deploy-inference-cpu.sh must run as root" >&2
  exit 1
fi

if [ ! -f "$API_ENV" ]; then
  echo "Missing required file: $API_ENV" >&2
  exit 1
fi

if ! "$PYTHON_BIN" -m venv --help >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Missing python venv support or ffmpeg, and apt-get is unavailable" >&2
    exit 1
  fi
  apt-get update
  apt-get install -y python3-venv ffmpeg
fi

mkdir -p "$(dirname "$VENV_DIR")" "$MODEL_CACHE"
chown -R "$APP_USER:$APP_GROUP" "$(dirname "$VENV_DIR")" "$MODEL_CACHE"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/pip" install --index-url https://download.pytorch.org/whl/cpu "torch==2.6.0"
"$VENV_DIR/bin/pip" install -r "$APP_DIR/infra/inference/cpu-server/requirements.txt"

cat >/etc/systemd/system/"$SERVICE_NAME".service <<UNIT
[Unit]
Description=Nuru CPU inference service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR/infra/inference/cpu-server
Environment=HF_HOME=$MODEL_CACHE
Environment=TRANSFORMERS_CACHE=$MODEL_CACHE
Environment=EMBEDDING_MODEL=BAAI/bge-m3
Environment=EMBEDDING_DIM=1024
Environment=EMBEDDING_DEVICE=cpu
Environment=RERANKER_MODE=lexical
Environment=WHISPER_MODEL=small
Environment=WHISPER_DEVICE=cpu
Environment=WHISPER_COMPUTE_TYPE=int8
Environment=INFERENCE_PRELOAD=embedding,whisper
ExecStart=$VENV_DIR/bin/uvicorn app:app --host 127.0.0.1 --port $PORT --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^$key=" "$API_ENV"; then
    sed -i "s|^$key=.*|$key=$value|" "$API_ENV"
  else
    printf '%s=%s\n' "$key" "$value" >>"$API_ENV"
  fi
}

upsert_env "EMBEDDING_URL" "http://127.0.0.1:$PORT"
upsert_env "RERANKER_URL" "http://127.0.0.1:$PORT"
upsert_env "WHISPER_URL" "http://127.0.0.1:$PORT"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null; then
    break
  fi
  sleep 10
done

curl -fsS "http://127.0.0.1:$PORT/health"
systemctl restart nuru-api nuru-workers
sleep 3
systemctl is-active "$SERVICE_NAME" nuru-api nuru-workers
curl -fsS https://api.nuruhomes.com/health
