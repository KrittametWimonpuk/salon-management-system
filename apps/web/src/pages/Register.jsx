// หน้าสมัครสมาชิก
import { useState } from 'react'
import { api } from '../api.js'

export default function Register({ onAuthed, goLogin }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api.register({ name, email, password })
      onAuthed(data)          // สมัครเสร็จ ล็อกอินให้อัตโนมัติเลย
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>สมัครสมาชิก</h1>
        <form onSubmit={submit}>
          <label>ชื่อ</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />

          <label>อีเมล</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <label>รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

          {error && <p className="error">{error}</p>}

          <button className="mt" type="submit" disabled={busy}>
            {busy ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
          </button>
        </form>
        <p className="muted mt">
          มีบัญชีอยู่แล้ว? <button className="link" onClick={goLogin}>เข้าสู่ระบบ</button>
        </p>
      </div>
    </div>
  )
}
