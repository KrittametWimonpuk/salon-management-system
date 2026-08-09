# ---------------------------------------------------------------------------
# ตั้งค่าการ deploy — คัดลอกไฟล์นี้เป็น config.sh แล้วแก้ค่าตามต้องการ
#   cp deploy/config.example.sh deploy/config.sh
#
# (config.sh ถูกใส่ไว้ใน .gitignore แล้ว จะไม่ถูก push ขึ้น git)
# ---------------------------------------------------------------------------

# ภูมิภาค AWS ที่จะ deploy (ap-southeast-7 = กรุงเทพฯ)
export AWS_REGION="ap-southeast-7"

# ชื่อโปรเจกต์ — ใช้ตั้งชื่อ resource ต่าง ๆ (ห้ามเว้นวรรค ใช้ตัวเล็ก-ขีดกลาง)
export APP_NAME="webapp-starter"

# tag ของ image (ปกติใช้ latest หรือจะใส่เลข version ก็ได้)
export IMAGE_TAG="latest"

# ---- ฐานข้อมูล ----
# ถ้าเว้นว่างไว้ สคริปต์ 02-infra.sh จะสร้าง RDS PostgreSQL ให้อัตโนมัติ
# ถ้ามี Postgres อยู่แล้ว (เช่น Neon / Supabase / RDS เดิม) ให้ใส่ทั้งสายที่นี่
#   ตัวอย่าง: export DATABASE_URL="postgresql://user:pass@host:5432/db"
export DATABASE_URL=""

# ค่าที่ใช้ตอนสร้าง RDS ใหม่ (ใช้เมื่อ DATABASE_URL ว่างเท่านั้น)
export DB_NAME="appdb"
export DB_USER="postgres"
export DB_PASSWORD="CHANGE-ME-Strong-Passw0rd"   # <-- แก้ให้เดายาก

# ---- ความลับของแอป ----
# สร้างค่าสุ่มยาว ๆ ด้วย:  openssl rand -hex 32
# Secrets ต้องสร้างใน AWS Secrets Manager และให้ ECS execution role อ่านได้
export DATABASE_URL_SECRET_ARN="arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:salon/database-url"
export JWT_ACCESS_SECRET_ARN="arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:salon/jwt-access"
export JWT_REFRESH_SECRET_ARN="arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:salon/jwt-refresh"

export JWT_ISSUER="salon-api"
export JWT_AUDIENCE="salon-web"
export CORS_ORIGINS="https://salon.example.com"

# ---- ขนาดเครื่อง (Fargate) ----
# 256 = 0.25 vCPU, 512 = 0.5 GB RAM  (ค่าต่ำสุด ประหยัดสุด)
export TASK_CPU="256"
export TASK_MEMORY="512"
