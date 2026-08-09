# 🚀 Webapp Starter — เทมเพลตเริ่มต้นพัฒนาระบบ (แจกฟรี)

เทมเพลตเว็บแอปแบบ **"มีทุกอย่างที่ต้องใช้จริง"** สำหรับคนอยากเริ่มต้นพัฒนาระบบ
มาพร้อม **สมัครสมาชิก / เข้าสู่ระบบ + ตัวอย่าง CRUD** และ **deploy ขึ้น AWS ECS ได้จริง** ด้วยสคริปต์เดียว

> เป้าหมาย: อ่านโค้ดรู้เรื่อง, รันได้ใน 5 นาที, และเข้าใจว่าระบบจริงประกอบด้วยอะไรบ้าง
> โค้ดทุกส่วนมี **คอมเมนต์ภาษาไทย** อธิบายว่าแต่ละบรรทัดทำอะไร

---

## 🧩 ในนี้มีอะไรบ้าง

| ส่วน | เทคโนโลยี | ทำหน้าที่ |
|------|-----------|-----------|
| **Frontend** | React + Vite | หน้าเว็บ (สมัคร/ล็อกอิน/รายการครุภัณฑ์) |
| **Backend** | Express (Node.js) | API + ตรวจสอบสิทธิ์ด้วย JWT |
| **Database** | PostgreSQL + Prisma | เก็บข้อมูลผู้ใช้และครุภัณฑ์ IT |
| **Container** | Docker | แพ็กแอปให้รันที่ไหนก็ได้ |
| **Cloud** | AWS ECS (Fargate) + ALB + RDS | รันบนคลาวด์จริง |

```
webapp-starter/
├── apps/
│   ├── api/          👈 Backend (Express + Prisma)
│   └── web/          👈 Frontend (React)
├── deploy/           👈 สคริปต์ deploy ขึ้น AWS ECS
├── docker-compose.yml   👈 รันทั้งระบบบนเครื่องด้วยคำสั่งเดียว
└── README.md
```

---

## ▶️ วิธีรันบนเครื่องตัวเอง (ง่ายสุด)

ต้องมี **Docker Desktop** ติดตั้งไว้ก่อน จากนั้น:

```bash
docker compose up --build
```

รอสักครู่ แล้วเปิดเบราว์เซอร์ที่ 👉 **http://localhost:8080**

- ลองกด "สมัครสมาชิก" → ล็อกอิน → เพิ่ม/แก้ไข/ลบครุภัณฑ์
- ฐานข้อมูล Postgres จะรันให้อัตโนมัติในอีก container หนึ่ง
- ตาราง (migration) จะถูกสร้างให้เองตอน API สตาร์ท

หยุดการทำงาน: กด `Ctrl+C` แล้ว `docker compose down`

---

## 🛠️ วิธีรันแบบ "พัฒนา" (แก้โค้ดแล้วเห็นผลทันที)

เปิด 3 เทอร์มินัล (หรือใช้ Docker แค่ตัว db):

```bash
# เทอร์มินัล 1 — ฐานข้อมูล
docker compose up db

# เทอร์มินัล 2 — Backend
cd apps/api
cp ../../.env.example .env      # แล้วแก้ค่าใน .env ถ้าต้องการ
npm install
npm run migrate:dev             # สร้างตารางในฐานข้อมูล
npm run seed                    # (ไม่บังคับ) ใส่ผู้ใช้ตัวอย่าง demo@example.com / password123
npm run dev

# เทอร์มินัล 3 — Frontend
cd apps/web
npm install
npm run dev                     # เปิด http://localhost:5173
```

Vite จะส่งต่อ `/api` ไปที่ backend (พอร์ต 4000) ให้อัตโนมัติ

---

## ☁️ วิธี Deploy ขึ้น AWS ECS

### เตรียมของ
1. ติดตั้ง [AWS CLI](https://aws.amazon.com/cli/) และ [Docker](https://www.docker.com/)
2. ล็อกอิน AWS: `aws configure` (ใส่ Access Key ที่มีสิทธิ์ ECS/ECR/RDS/ELB/IAM)

### ตั้งค่า
```bash
cp deploy/config.example.sh deploy/config.sh
# แก้ไฟล์ deploy/config.sh และกำหนด Secrets Manager ARNs สำหรับ database/access/refresh token
```

### รัน (ครั้งแรก)
```bash
cd deploy
./deploy-all.sh
```

สคริปต์จะทำให้อัตโนมัติ:
1. **00** ตรวจความพร้อม (aws cli / docker / login)
2. **01** build image แล้ว push ขึ้น ECR
3. **02** สร้างโครงสร้างพื้นฐาน (VPC, Security Group, **RDS Postgres**, ECS Cluster, **Load Balancer**)
4. **03** สั่งรัน container บน ECS Fargate + ผูกกับ Load Balancer

พอเสร็จจะได้ URL หน้าตาแบบ `http://webapp-starter-alb-xxxx.ap-southeast-7.elb.amazonaws.com`

### Deploy เวอร์ชันใหม่ (หลังแก้โค้ด)
```bash
cd deploy
./01-build-push.sh && ./03-deploy.sh
```

### ลบทิ้ง (กันโดนคิดเงิน)
```bash
cd deploy
./99-destroy.sh
```

---

## 🗺️ ระบบทำงานยังไง (ภาพรวม)

```
ผู้ใช้ (เบราว์เซอร์)
      │  http://...elb.amazonaws.com
      ▼
┌─────────────────────┐
│  ALB (Load Balancer)│   แยกเส้นทาง:
└─────────────────────┘   /api/* → API,  อื่น ๆ → Web
      │                        │
      ▼                        ▼
┌──────────┐            ┌──────────┐        ┌──────────────┐
│  Web     │            │  API     │ ─────► │ RDS Postgres │
│ (React)  │            │(Express) │        │  (ฐานข้อมูล)  │
└──────────┘            └──────────┘        └──────────────┘
   ทั้งสองรันเป็น container บน ECS Fargate
```

---

## 🔑 จุดสำคัญที่ควรเข้าใจ (สำหรับมือใหม่)

- **รหัสผ่านไม่เคยถูกเก็บตรง ๆ** — เก็บเป็น hash ด้วย bcrypt ([auth.js](apps/api/src/routes/auth.js))
- **JWT** คือ "บัตรผ่าน" ที่เซิร์ฟเวอร์เซ็นให้ตอนล็อกอิน ฝั่งหน้าเว็บเก็บไว้แล้วแนบไปทุก request ([auth.js](apps/api/src/middleware/auth.js))
- **CRUD ทุกอันเช็กเจ้าของเสมอ** — ผู้ใช้เห็น/แก้ได้เฉพาะข้อมูลตัวเอง ([assets.js](apps/api/src/routes/assets.js))
- **Health check** (`/health`) มีไว้ให้ AWS เช็กว่าเซิร์ฟเวอร์ยังมีชีวิต ([index.js](apps/api/src/index.js))
- **Migration** = ประวัติการเปลี่ยนโครงสร้างฐานข้อมูล รันอัตโนมัติตอน container สตาร์ท

---

## ⚠️ หมายเหตุด้านความปลอดภัย (ก่อนใช้งานจริงจัง)

เทมเพลตนี้เน้น **"เข้าใจง่าย"** จึงลัดบางอย่างเพื่อการเรียนรู้ ถ้าจะใช้งานจริงควร:

- เก็บ `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` และ `DATABASE_URL` ใน **AWS Secrets Manager** และอ้างผ่าน ECS task secrets
- เพิ่ม **HTTPS** ที่ ALB (ใช้ ACM certificate + listener :443)
- จำกัดสิทธิ์ IAM ให้แคบลง (least privilege)
- ตั้ง `desired-count` มากกว่า 1 เพื่อความทนทาน

---

## 📄 License

MIT — ใช้ ต่อยอด แจกจ่าย ได้อิสระ ขอให้สนุกกับการเริ่มต้นพัฒนาระบบ 🎉
