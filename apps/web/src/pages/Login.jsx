// หน้าเข้าสู่ระบบ
import { useState } from 'react'
import { api } from '../api.js'

export default function Login({ onAuthed, goRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()          // กันไม่ให้หน้า reload
    setError('')
    setBusy(true)
    try {
      const data = await api.login({ email, password })
      onAuthed(data)            // สำเร็จ -> ส่ง token+user กลับไปให้ App
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>เข้าสู่ระบบ</h1>
        <form onSubmit={submit}>
          <label>อีเมล</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <label>รหัสผ่าน</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

          {error && <p className="error">{error}</p>}

          <button className="mt" type="submit" disabled={busy}>
            {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
        <p className="muted mt">
          ยังไม่มีบัญชี? <button className="link" onClick={goRegister}>สมัครสมาชิก</button>
        </p>
      </div>
    </div>
  )
}
