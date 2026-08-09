// ---------------------------------------------------------------------------
// ตัวช่วยเรียก API — รวมโค้ด fetch ไว้ที่เดียว
//
// - เก็บ token ไว้ใน localStorage (ค้างแม้ปิดเบราว์เซอร์)
// - แนบ header Authorization ให้อัตโนมัติทุกครั้งที่มี token
// - Backend ตอบกลับด้วยรูปแบบเดียวกันเสมอ:
//     สำเร็จ   { success: true, data: ... }         -> คืนแค่ data ให้หน้าจอใช้ตรง ๆ
//     ผิดพลาด  { success: false, message, errors }  -> throw Error(message) พร้อมแนบ .errors ไว้ด้วย
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'token'

export const auth = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = auth.get()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { ...options, headers })
  const body = await res.json().catch(() => ({}))

  if (!res.ok || !body.success) {
    const err = new Error(body.message || 'เกิดข้อผิดพลาด')
    err.errors = body.errors || null   // รายการ { field, message } ถ้ามี — ใช้โชว์ error รายฟิลด์ในฟอร์ม
    throw err
  }
  return body.data
}

// แปลง object ธรรมดา { page: 1, search: 'dell' } ให้เป็น query string
// ข้าม key ที่เป็น undefined/null/สตริงว่าง เพื่อไม่ให้ยิง ?search=&sortBy= เปล่า ๆ ไปโดยไม่จำเป็น
function toQueryString(params = {}) {
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    usp.set(key, value)
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}

// สร้างชุดฟังก์ชัน list/get/add/update/delete ให้ entity ที่มี REST pattern เดียวกัน
// (Category/Location/Department/Vendor ทำงานเหมือนกันทุกตัว ต่างแค่ path) — กันไม่ต้องเขียนซ้ำ 4 รอบ
function createEntityApi(basePath) {
  return {
    list: (params) => request(`${basePath}${toQueryString(params)}`),
    get: (id) => request(`${basePath}/${id}`),
    add: (body) => request(basePath, { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`${basePath}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => request(`${basePath}/${id}`, { method: 'DELETE' }),
  }
}

// รวม endpoint ทั้งหมดไว้เป็นฟังก์ชันสั้น ๆ ให้หน้าจอเรียกง่าย
export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),

  // params รองรับ: page, pageSize, sortBy, sortOrder, search
  listAssets: (params) => request(`/assets${toQueryString(params)}`),
  getAsset: (id) => request(`/assets/${id}`),
  addAsset: (body) => request('/assets', { method: 'POST', body: JSON.stringify(body) }),
  updateAsset: (id, body) => request(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAsset: (id) => request(`/assets/${id}`, { method: 'DELETE' }),

  // master data — แต่ละตัวรองรับ params: page, pageSize, sortBy, sortOrder, search, isActive
  categories: createEntityApi('/categories'),
  locations: createEntityApi('/locations'),
  departments: createEntityApi('/departments'),
  vendors: createEntityApi('/vendors'),
}
