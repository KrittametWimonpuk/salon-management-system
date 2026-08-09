#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ขั้นที่ 2: สร้างโครงสร้างพื้นฐานบน AWS (ทำครั้งเดียว)
#   - หา VPC/subnet ที่มีอยู่แล้ว (ใช้ default VPC)
#   - Security Group (กฎ firewall)
#   - RDS PostgreSQL (ถ้ายังไม่ได้ใส่ DATABASE_URL ใน config)
#   - ECS Cluster + CloudWatch Logs + IAM role
#   - Application Load Balancer (ALB) + Target Group + กติกาแยกเส้นทาง /api
#
# สคริปต์นี้ "idempotent" = รันซ้ำได้ ถ้ามีของอยู่แล้วจะไม่สร้างซ้ำ
# ---------------------------------------------------------------------------
source "$(dirname "$0")/lib.sh"
: "${ACCOUNT_ID:?รัน 00-check.sh ก่อน}"

# ===== 1) หา VPC + subnet =====
log "ค้นหา default VPC..."
VPC=$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true \
      --query 'Vpcs[0].VpcId' --output text)
[ "$VPC" = "None" ] && die "ไม่พบ default VPC — สร้าง VPC ก่อน หรือแก้สคริปต์ให้ชี้ VPC เอง"
save_state VPC "$VPC"

# เอา subnet 2 อัน (ALB ต้องการอย่างน้อย 2 availability zone)
read -r SUBNET1 SUBNET2 _ < <(aws_ ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC" \
  --query 'Subnets[].SubnetId' --output text)
[ -z "${SUBNET2:-}" ] && die "ต้องมี subnet อย่างน้อย 2 อันใน VPC"
save_state SUBNET1 "$SUBNET1"
save_state SUBNET2 "$SUBNET2"
ok "VPC=$VPC  subnets=$SUBNET1,$SUBNET2"

# ===== 2) Security Groups =====
ensure_sg() {
  local name="$1" desc="$2" id
  id=$(aws_ ec2 describe-security-groups \
        --filters Name=group-name,Values="$name" Name=vpc-id,Values="$VPC" \
        --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
  if [ "$id" = "None" ] || [ -z "$id" ]; then
    id=$(aws_ ec2 create-security-group --group-name "$name" \
          --description "$desc" --vpc-id "$VPC" --query GroupId --output text)
  fi
  echo "$id"
}

log "สร้าง Security Groups..."
ALB_SG=$(ensure_sg "${APP_NAME}-alb-sg"  "ALB inbound 80")
TASK_SG=$(ensure_sg "${APP_NAME}-task-sg" "ECS tasks")
RDS_SG=$(ensure_sg "${APP_NAME}-rds-sg"  "RDS postgres")
save_state ALB_SG "$ALB_SG"; save_state TASK_SG "$TASK_SG"; save_state RDS_SG "$RDS_SG"

# เปิดพอร์ต (authorize ซ้ำจะ error เฉย ๆ จึง || true)
aws_ ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 >/dev/null 2>&1 || true
# task รับจาก ALB ทั้งพอร์ต web(80) และ api(4000)
aws_ ec2 authorize-security-group-ingress --group-id "$TASK_SG" \
  --protocol tcp --port 80 --source-group "$ALB_SG" >/dev/null 2>&1 || true
aws_ ec2 authorize-security-group-ingress --group-id "$TASK_SG" \
  --protocol tcp --port 4000 --source-group "$ALB_SG" >/dev/null 2>&1 || true
# RDS รับจาก task เท่านั้น
aws_ ec2 authorize-security-group-ingress --group-id "$RDS_SG" \
  --protocol tcp --port 5432 --source-group "$TASK_SG" >/dev/null 2>&1 || true
ok "Security Groups พร้อม"

# ===== 3) RDS PostgreSQL (ถ้ายังไม่มี DATABASE_URL) =====
if [ -z "${DATABASE_URL:-}" ]; then
  DB_ID="${APP_NAME}-db"
  log "สร้าง DB subnet group..."
  aws_ rds create-db-subnet-group \
    --db-subnet-group-name "${APP_NAME}-subnets" \
    --db-subnet-group-description "subnets for $APP_NAME" \
    --subnet-ids "$SUBNET1" "$SUBNET2" >/dev/null 2>&1 || true

  if ! aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" >/dev/null 2>&1; then
    log "สร้าง RDS PostgreSQL (db.t3.micro) — ใช้เวลา ~5-10 นาที..."
    aws_ rds create-db-instance \
      --db-instance-identifier "$DB_ID" \
      --db-instance-class db.t3.micro \
      --engine postgres \
      --allocated-storage 20 \
      --master-username "$DB_USER" \
      --master-user-password "$DB_PASSWORD" \
      --db-name "$DB_NAME" \
      --db-subnet-group-name "${APP_NAME}-subnets" \
      --vpc-security-group-ids "$RDS_SG" \
      --no-publicly-accessible \
      --backup-retention-period 1 >/dev/null
  fi

  log "รอ RDS พร้อมใช้งาน..."
  aws_ rds wait db-instance-available --db-instance-identifier "$DB_ID"
  ENDPOINT=$(aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" \
             --query 'DBInstances[0].Endpoint.Address' --output text)
  DB_URL_FINAL="postgresql://${DB_USER}:${DB_PASSWORD}@${ENDPOINT}:5432/${DB_NAME}?schema=public"
  ok "RDS พร้อม: $ENDPOINT"
else
  DB_URL_FINAL="$DATABASE_URL"
  ok "ใช้ DATABASE_URL ที่กำหนดใน config"
fi
save_state DB_URL_FINAL "$DB_URL_FINAL"

# ===== 4) ECS Cluster + Logs + IAM role =====
log "สร้าง ECS cluster..."
aws_ ecs create-cluster --cluster-name "${APP_NAME}-cluster" >/dev/null 2>&1 || true

log "สร้าง CloudWatch log groups..."
aws_ logs create-log-group --log-group-name "/ecs/${APP_NAME}-api" >/dev/null 2>&1 || true
aws_ logs create-log-group --log-group-name "/ecs/${APP_NAME}-web" >/dev/null 2>&1 || true

log "เตรียม IAM execution role (ให้ ECS ดึง image + เขียน log ได้)..."
ROLE_NAME="${APP_NAME}-exec-role"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy >/dev/null
fi
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "${APP_NAME}-read-runtime-secrets" \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\"],\"Resource\":[\"${DATABASE_URL_SECRET_ARN}\",\"${JWT_ACCESS_SECRET_ARN}\",\"${JWT_REFRESH_SECRET_ARN}\"]}]}" >/dev/null
EXEC_ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
save_state EXEC_ROLE_ARN "$EXEC_ROLE_ARN"

# ===== 5) ALB + Target Groups + Listener =====
log "สร้าง Application Load Balancer..."
ALB_ARN=$(aws_ elbv2 describe-load-balancers --names "${APP_NAME}-alb" \
          --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo None)
if [ "$ALB_ARN" = "None" ] || [ -z "$ALB_ARN" ]; then
  ALB_ARN=$(aws_ elbv2 create-load-balancer --name "${APP_NAME}-alb" \
    --subnets "$SUBNET1" "$SUBNET2" --security-groups "$ALB_SG" \
    --scheme internet-facing --type application \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
fi
save_state ALB_ARN "$ALB_ARN"

ensure_tg() {
  local name="$1" port="$2" hpath="$3" arn
  arn=$(aws_ elbv2 describe-target-groups --names "$name" \
        --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo None)
  if [ "$arn" = "None" ] || [ -z "$arn" ]; then
    arn=$(aws_ elbv2 create-target-group --name "$name" \
      --protocol HTTP --port "$port" --vpc-id "$VPC" --target-type ip \
      --health-check-path "$hpath" \
      --query 'TargetGroups[0].TargetGroupArn' --output text)
  fi
  echo "$arn"
}

log "สร้าง Target Groups..."
TG_WEB=$(ensure_tg "${APP_NAME}-web-tg" 80 "/")
TG_API=$(ensure_tg "${APP_NAME}-api-tg" 4000 "/health")
save_state TG_WEB "$TG_WEB"; save_state TG_API "$TG_API"

log "สร้าง Listener (:80) + กติกาแยก /api ..."
LISTENER=$(aws_ elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
           --query 'Listeners[?Port==`80`].ListenerArn | [0]' --output text 2>/dev/null || echo None)
if [ "$LISTENER" = "None" ] || [ -z "$LISTENER" ]; then
  LISTENER=$(aws_ elbv2 create-listener --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 80 \
    --default-actions "Type=forward,TargetGroupArn=$TG_WEB" \
    --query 'Listeners[0].ListenerArn' --output text)
fi
save_state LISTENER "$LISTENER"

# กติกา: path /api/* -> api target group (สร้างถ้ายังไม่มี priority 10)
if ! aws_ elbv2 describe-rules --listener-arn "$LISTENER" \
      --query 'Rules[?Priority==`10`]' --output text | grep -q .; then
  aws_ elbv2 create-rule --listener-arn "$LISTENER" --priority 10 \
    --conditions Field=path-pattern,Values='/api/*' \
    --actions "Type=forward,TargetGroupArn=$TG_API" >/dev/null
fi

ALB_DNS=$(aws_ elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" \
          --query 'LoadBalancers[0].DNSName' --output text)
save_state ALB_DNS "$ALB_DNS"

ok "โครงสร้างพื้นฐานพร้อม"
echo "   URL (จะใช้ได้หลังรัน 03-deploy.sh):  http://${ALB_DNS}"
