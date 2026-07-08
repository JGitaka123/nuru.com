#!/usr/bin/env bash
set -euo pipefail

# Deploy the current main branch on the Contabo VPS.
#
# Run on the VPS as root:
#   APP_DIR=/opt/nuru/app scripts/deploy-contabo.sh
#
# The script intentionally parses only the env vars needed for build-time
# commands. Do not source /etc/nuru/*.env directly: values such as EMAIL_FROM
# can contain spaces and are valid for systemd EnvironmentFile but unsafe for
# shell source.

APP_DIR="${APP_DIR:-/opt/nuru/app}"
APP_USER="${APP_USER:-nuru}"
APP_GROUP="${APP_GROUP:-nuru}"
API_ENV="${API_ENV:-/etc/nuru/api.env}"
WEB_ENV="${WEB_ENV:-/etc/nuru/web.env}"
NODE_PATH_DIR="${NODE_PATH_DIR:-/opt/nodejs/node20/bin}"
WEB_ORIGIN="${WEB_ORIGIN:-https://nuruhomes.com}"
API_HEALTH_URL="${API_HEALTH_URL:-https://api.nuruhomes.com/health}"
SERVICES="${SERVICES:-nuru-api nuru-workers nuru-web}"

export PATH="$NODE_PATH_DIR:/usr/local/bin:/usr/bin:/bin:$PATH"

if [ "$(id -u)" -ne 0 ]; then
  echo "deploy-contabo.sh must run as root so it can restart systemd services" >&2
  exit 1
fi

read_env() {
  local file="$1"
  local key="$2"
  local value
  value="$(
    awk -F= -v key="$key" 'index($0, key "=") == 1 {
      sub(/^[^=]*=/, "")
      print
      exit
    }' "$file"
  )"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

run_as_app_user() {
  local workdir="$1"
  shift
  su -s /bin/bash "$APP_USER" -c "export PATH='$PATH'; cd '$workdir'; $*"
}

require_file() {
  if [ ! -f "$1" ]; then
    echo "Missing required file: $1" >&2
    exit 1
  fi
}

require_file "$API_ENV"
require_file "$WEB_ENV"

cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1 || true
git fetch origin main
git checkout main
git pull --ff-only origin main

chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

export DATABASE_URL
export DIRECT_URL
DATABASE_URL="$(read_env "$API_ENV" DATABASE_URL)"
DIRECT_URL="$(read_env "$API_ENV" DIRECT_URL)"

run_as_app_user "$APP_DIR" "pnpm install --frozen-lockfile"
run_as_app_user "$APP_DIR" "pnpm build"

for key in \
  API_URL \
  NEXT_PUBLIC_API_URL \
  NEXT_PUBLIC_WEB_URL \
  NEXT_PUBLIC_PHOTO_URL \
  NEXT_PUBLIC_VAPID_PUBLIC_KEY \
  NEXT_PUBLIC_FREE_LAUNCH_UNTIL
do
  value="$(read_env "$WEB_ENV" "$key")"
  if [ -n "$value" ]; then
    export "$key=$value"
  fi
done

run_as_app_user "$APP_DIR/web" "pnpm install --frozen-lockfile"
run_as_app_user "$APP_DIR/web" "pnpm build"

chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

systemctl restart $SERVICES
sleep 3
systemctl is-active $SERVICES

curl -fsS "$API_HEALTH_URL" >/dev/null
curl -fsSI "$WEB_ORIGIN/login" >/dev/null

echo "Deployed $(git rev-parse --short HEAD) to Contabo"
