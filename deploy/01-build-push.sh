#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ขั้นที่ 1: สร้าง Docker image แล้ว push ขึ้น ECR (คลังเก็บ image ของ AWS)
# ---------------------------------------------------------------------------
source "$(dirname "$0")/lib.sh"

: "${ACCOUNT_ID:?รัน 00-check.sh ก่อน}"
ECR_HOST="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
REPO_API="${APP_NAME}-api"
REPO_WEB="${APP_NAME}-web"

# สร้าง ECR repository ถ้ายังไม่มี (idempotent)
ensure_repo() {
  local name="$1"
  aws_ ecr describe-repositories --repository-names "$name" >/dev/null 2>&1 \
    || aws_ ecr create-repository --repository-name "$name" >/dev/null
}

log "เตรียม ECR repository..."
ensure_repo "$REPO_API"
ensure_repo "$REPO_WEB"

log "login docker เข้ากับ ECR..."
aws_ ecr get-login-password | docker login --username AWS --password-stdin "$ECR_HOST"

# --- API ---
log "build + push image: $REPO_API"
docker build -t "${ECR_HOST}/${REPO_API}:${IMAGE_TAG}" "$HERE/../apps/api"
docker push "${ECR_HOST}/${REPO_API}:${IMAGE_TAG}"

# --- WEB ---
log "build + push image: $REPO_WEB"
docker build -t "${ECR_HOST}/${REPO_WEB}:${IMAGE_TAG}" "$HERE/../apps/web"
docker push "${ECR_HOST}/${REPO_WEB}:${IMAGE_TAG}"

save_state IMAGE_API "${ECR_HOST}/${REPO_API}:${IMAGE_TAG}"
save_state IMAGE_WEB "${ECR_HOST}/${REPO_WEB}:${IMAGE_TAG}"
ok "push image ขึ้น ECR เรียบร้อย"
