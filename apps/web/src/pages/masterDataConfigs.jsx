// ---------------------------------------------------------------------------
// Config สำหรับแต่ละหน้า master data — ให้ App.jsx render <MasterDataPage {...config}/>
// แทนการเขียนหน้าแยกทีละไฟล์ที่หน้าตาเหมือนกันเกือบทั้งหมด
// ---------------------------------------------------------------------------
import { api } from '../api.js'

function statusBadge(item) {
  return (
    <span className={`badge ${item.isActive ? 'badge-available' : 'badge-disposed'}`}>
      {item.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
    </span>
  )
}

// Category / Location / Department มีโครงเหมือนกันทุกอย่าง (name, description, isActive)
// ใช้ฟังก์ชันนี้สร้าง config ให้ทั้งสามตัว กันไม่ต้องเขียนซ้ำ
function simpleMasterDataConfig({ title, entityLabel, entityApi, searchPlaceholder }) {
  return {
    title,
    entityLabel,
    entityApi,
    searchPlaceholder,
    fields: [
      { name: 'name', label: `ชื่อ${entityLabel}`, required: true },
      { name: 'description', label: 'คำอธิบาย', type: 'textarea' },
      { name: 'isActive', label: 'เปิดใช้งาน', type: 'checkbox' },
    ],
    columns: [
      { key: 'name', label: 'ชื่อ' },
      { key: 'description', label: 'คำอธิบาย', render: (item) => item.description || '-' },
      { key: 'isActive', label: 'สถานะ', render: statusBadge },
    ],
  }
}

export const categoryConfig = simpleMasterDataConfig({
  title: 'หมวดหมู่ครุภัณฑ์',
  entityLabel: 'หมวดหมู่',
  entityApi: api.categories,
  searchPlaceholder: 'ค้นหาหมวดหมู่...',
})

export const locationConfig = simpleMasterDataConfig({
  title: 'สถานที่ตั้ง',
  entityLabel: 'สถานที่',
  entityApi: api.locations,
  searchPlaceholder: 'ค้นหาสถานที่...',
})

export const departmentConfig = simpleMasterDataConfig({
  title: 'แผนก',
  entityLabel: 'แผนก',
  entityApi: api.departments,
  searchPlaceholder: 'ค้นหาแผนก...',
})

export const vendorConfig = {
  title: 'ผู้ขาย/ผู้ผลิต',
  entityLabel: 'ผู้ขาย/ผู้ผลิต',
  entityApi: api.vendors,
  searchPlaceholder: 'ค้นหาชื่อ, ผู้ติดต่อ, อีเมล...',
  fields: [
    { name: 'name', label: 'ชื่อผู้ขาย/ผู้ผลิต', required: true },
    { name: 'contactName', label: 'ชื่อผู้ติดต่อ' },
    { name: 'phone', label: 'เบอร์โทร' },
    { name: 'email', label: 'อีเมล', type: 'email' },
    { name: 'website', label: 'เว็บไซต์' },
    { name: 'address', label: 'ที่อยู่', type: 'textarea' },
    { name: 'isActive', label: 'เปิดใช้งาน', type: 'checkbox' },
  ],
  columns: [
    { key: 'name', label: 'ชื่อ' },
    { key: 'contactName', label: 'ผู้ติดต่อ', render: (item) => item.contactName || '-' },
    { key: 'phone', label: 'เบอร์โทร', render: (item) => item.phone || '-' },
    { key: 'email', label: 'อีเมล', render: (item) => item.email || '-' },
    { key: 'isActive', label: 'สถานะ', render: statusBadge },
  ],
}
