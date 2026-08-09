#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ขั้นที่ 3: นำ image ขึ้นรันจริงบน ECS Fargate
#   - สร้าง "task definition" (สูตรบอกว่าจะรัน container อะไร ด้วยค่าอะไร)
#   - สร้าง/อัปเดต "service" (ตัวคุมให้ container รันอยู่ตลอด + ผูกกับ ALB)
#
# รันซ้ำได้: ถ้ามี service อยู่แล้วจะสั่ง deploy เวอร์ชันใหม่แทน
# ---------------------------------------------------------------------------
source "$(dirname "$0")/lib.sh"
: "${IMAGE_API:?รัน 01-build-push.sh ก่อน}"
: "${EXEC_ROLE_ARN:?รัน 02-infra.sh ก่อน}"

CLUSTER="${APP_NAME}-cluster"
TMP="$(mktemp -d)"

# แทนค่าตัวแปรลงใน task definition template แล้ว register
register_td() {
  local tpl="$1" out="$TMP/$(basename "$1")"
  envsubst < "$HERE/$tpl" > "$out"
  aws_ ecs register-task-definition --cli-input-json "file://$out" \
    --query 'taskDefinition.taskDefinitionArn' --output text
}

log "ลงทะเบียน task definitions..."
API_TD=$(register_td task-def-api.json)
WEB_TD=$(register_td task-def-web.json)
ok "api=$API_TD"
ok "web=$WEB_TD"

NET="awsvpcConfiguration={subnets=[$SUBNET1,$SUBNET2],securityGroups=[$TASK_SG],assignPublicIp=ENABLED}"

# สร้าง service ถ้ายังไม่มี ไม่งั้นสั่ง deploy ใหม่
deploy_service() {
  local name="$1" td="$2" tg="$3" container="$4" port="$5"
  local status
  status=$(aws_ ecs describe-services --cluster "$CLUSTER" --services "$name" \
           --query 'services[0].status' --output text 2>/dev/null || echo MISSING)

  if [ "$status" = "ACTIVE" ]; then
    log "อัปเดต service: $name"
    aws_ ecs update-service --cluster "$CLUSTER" --service "$name" \
      --task-definition "$td" --force-new-deployment >/dev/null
  else
    log "สร้าง service: $name"
    aws_ ecs create-service --cluster "$CLUSTER" --service-name "$name" \
      --task-definition "$td" --desired-count 1 --launch-type FARGATE \
      --network-configuration "$NET" \
      --load-balancers "targetGroupArn=$tg,containerName=$container,containerPort=$port" \
      >/dev/null
  fi
}

deploy_service "${APP_NAME}-api" "$API_TD" "$TG_API" "api" 4000
deploy_service "${APP_NAME}-web" "$WEB_TD" "$TG_WEB" "web" 80

log "รอให้ service พร้อม (อาจใช้เวลาสักครู่)..."
aws_ ecs wait services-stable --cluster "$CLUSTER" \
  --services "${APP_NAME}-api" "${APP_NAME}-web" || warn "ยังไม่ stable — ดู log ใน CloudWatch ได้"

rm -rf "$TMP"
echo ""
ok "Deploy สำเร็จ! เปิดเว็บได้ที่:"
echo "   👉  http://${ALB_DNS}"
