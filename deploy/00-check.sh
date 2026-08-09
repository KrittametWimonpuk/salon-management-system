#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ขั้นที่ 0: ตรวจความพร้อมก่อน deploy
#   - มี aws cli และ docker ไหม
#   - login AWS แล้วหรือยัง
# ---------------------------------------------------------------------------
source "$(dirname "$0")/lib.sh"

command -v aws >/dev/null    || die "ไม่พบ aws cli — ติดตั้งก่อน: https://aws.amazon.com/cli/"
command -v docker >/dev/null || die "ไม่พบ docker — ติดตั้ง Docker Desktop ก่อน"

log "ตรวจสอบ AWS credentials..."
ACCOUNT_ID="$(aws_ sts get-caller-identity --query Account --output text)" \
  || die "ยัง login AWS ไม่ได้ — รัน 'aws configure' ก่อน"

save_state ACCOUNT_ID "$ACCOUNT_ID"
ok "พร้อม deploy — AWS Account: $ACCOUNT_ID | Region: $AWS_REGION"
