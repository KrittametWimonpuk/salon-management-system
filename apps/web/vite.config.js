import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ---------------------------------------------------------------------------
// ตั้งค่า Vite (เครื่องมือ dev + build ของ frontend)
//
// server.proxy: ตอนพัฒนา (npm run dev) เวลาโค้ดเรียก "/api/..."
// Vite จะส่งต่อไปที่ backend ที่ http://localhost:4000 ให้อัตโนมัติ
// ทำให้ frontend/backend อยู่คนละพอร์ตได้โดยไม่ติดปัญหา CORS
// ---------------------------------------------------------------------------
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
