# ---------------------------------------------------------------------------
# ฟังก์ชันช่วยที่สคริปต์ทุกตัวเรียกใช้ร่วมกัน
# (ไฟล์นี้ไม่รันเอง จะถูก "source" โดยสคริปต์อื่น)
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# โหลด config.sh (ค่าที่ผู้ใช้ตั้ง)
if [ ! -f "$HERE/config.sh" ]; then
  echo "❌ ไม่พบ deploy/config.sh"
  echo "   ให้รัน:  cp deploy/config.example.sh deploy/config.sh  แล้วแก้ค่าก่อน"
  exit 1
fi
# shellcheck disable=SC1091
source "$HERE/config.sh"

# ไฟล์เก็บ ID ของ resource ที่สร้างไว้ (สคริปต์ตัวถัด ๆ ไปจะอ่านต่อ)
STATE_FILE="$HERE/.state.sh"
touch "$STATE_FILE"
# shellcheck disable=SC1090
source "$STATE_FILE"

# บันทึกค่าเก็บลง state (เช่น  save_state VPC_ID vpc-123)
save_state() {
  local key="$1" val="$2"
  # ลบบรรทัดเก่าของ key นี้ออกก่อน แล้วเขียนใหม่
  grep -v "^export ${key}=" "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null || true
  mv "$STATE_FILE.tmp" "$STATE_FILE"
  echo "export ${key}=\"${val}\"" >> "$STATE_FILE"
  export "${key}=${val}"
}

# สั่ง aws โดยแนบ region ให้อัตโนมัติ
aws_() { aws --region "$AWS_REGION" "$@"; }

log()  { echo "==> $*"; }
ok()   { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
die()  { echo "❌ $*" >&2; exit 1; }
