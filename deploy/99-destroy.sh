#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ลบทุกอย่างที่สร้างไว้ (กัน AWS คิดเงินต่อ)
# ⚠️  ลบข้อมูลใน RDS ด้วย — ใช้เมื่อแน่ใจแล้วเท่านั้น
# ---------------------------------------------------------------------------
source "$(dirname "$0")/lib.sh"

read -r -p "ยืนยันลบทุก resource ของ '${APP_NAME}'? พิมพ์ yes: " ans
[ "$ans" = "yes" ] || { echo "ยกเลิก"; exit 0; }

CLUSTER="${APP_NAME}-cluster"

log "ลบ ECS services..."
for s in "${APP_NAME}-api" "${APP_NAME}-web"; do
  aws_ ecs update-service --cluster "$CLUSTER" --service "$s" --desired-count 0 >/dev/null 2>&1 || true
  aws_ ecs delete-service --cluster "$CLUSTER" --service "$s" --force >/dev/null 2>&1 || true
done

log "ลบ Load Balancer + Target Groups..."
[ -n "${ALB_ARN:-}" ] && aws_ elbv2 delete-load-balancer --load-balancer-arn "$ALB_ARN" >/dev/null 2>&1 || true
sleep 15
[ -n "${TG_API:-}" ] && aws_ elbv2 delete-target-group --target-group-arn "$TG_API" >/dev/null 2>&1 || true
[ -n "${TG_WEB:-}" ] && aws_ elbv2 delete-target-group --target-group-arn "$TG_WEB" >/dev/null 2>&1 || true

log "ลบ RDS..."
aws_ rds delete-db-instance --db-instance-identifier "${APP_NAME}-db" \
  --skip-final-snapshot --delete-automated-backups >/dev/null 2>&1 || true

log "ลบ ECS cluster + log groups..."
aws_ ecs delete-cluster --cluster "$CLUSTER" >/dev/null 2>&1 || true
aws_ logs delete-log-group --log-group-name "/ecs/${APP_NAME}-api" >/dev/null 2>&1 || true
aws_ logs delete-log-group --log-group-name "/ecs/${APP_NAME}-web" >/dev/null 2>&1 || true

warn "หมายเหตุ: Security Group / IAM role / ECR repo / DB subnet group ต้องรอ resource ข้างบนหายก่อน"
warn "ถ้าลบไม่หมด ให้รันสคริปต์นี้ซ้ำอีกครั้งหลังผ่านไปสัก 2-3 นาที หรือลบใน AWS Console"
rm -f "$STATE_FILE"
ok "เริ่มลบเรียบร้อย"
