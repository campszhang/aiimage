#!/usr/bin/env bash
# Auto deploy aiimage on a single VM.
# Pulls origin/main, rebuilds the Docker image only when the commit changes,
# and keeps runtime data mounted on the VM local disk.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/campszhang/aiimage.git}"
BRANCH="${BRANCH:-main}"
APP_NAME="${APP_NAME:-aiimage-web}"
SRC_DIR="${SRC_DIR:-$HOME/aiimage-live-src}"
DATA_DIR="${DATA_DIR:-$HOME/aiimage-data}"
ENV_FILE="${ENV_FILE:-$HOME/aiimage-web.env}"
PORT_BIND="${PORT_BIND:-127.0.0.1:3000:3000}"
IMAGE_NAME="${IMAGE_NAME:-aiimage-web:latest}"
LOCK_FILE="/tmp/${APP_NAME}-autodeploy.lock"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another deploy is running, skip"
  exit 0
fi

mkdir -p "$DATA_DIR"

if [[ ! -d "$SRC_DIR/.git" ]]; then
  log "clone $REPO_URL -> $SRC_DIR"
  rm -rf "$SRC_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$SRC_DIR"
fi

cd "$SRC_DIR"
git fetch origin "$BRANCH"
LOCAL_COMMIT="$(git rev-parse HEAD)"
REMOTE_COMMIT="$(git rev-parse "origin/$BRANCH")"

if [[ "$LOCAL_COMMIT" == "$REMOTE_COMMIT" ]] && docker ps --format '{{.Names}}' | grep -qx "$APP_NAME"; then
  log "already up to date at ${LOCAL_COMMIT:0:7}"
  exit 0
fi

log "deploy ${LOCAL_COMMIT:0:7} -> ${REMOTE_COMMIT:0:7}"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

if [[ ! -f "$ENV_FILE" ]]; then
  log "create default env file: $ENV_FILE"
  cat > "$ENV_FILE" <<'EOF'
NODE_ENV=production
SESSION_SECRET=change-this-to-a-32-character-random-string
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=admin123456
CLOUD_STORAGE_UPLOAD_URL=https://zqyaitools.com/upload-image
CLOUD_STORAGE_FILE_FIELD=image
CLOUD_STORAGE_TIMEOUT_MS=12000
EOF
fi

log "build image $IMAGE_NAME"
docker build -t "$IMAGE_NAME" "$SRC_DIR/week1-mvp"

log "replace container $APP_NAME"
docker stop "$APP_NAME" >/dev/null 2>&1 || true
docker rm "$APP_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e DATA_DIR=/app/data \
  -v "$DATA_DIR:/app/data" \
  -p "$PORT_BIND" \
  "$IMAGE_NAME" >/dev/null

docker image prune -f >/dev/null 2>&1 || true
log "done at $(git rev-parse --short HEAD)"
