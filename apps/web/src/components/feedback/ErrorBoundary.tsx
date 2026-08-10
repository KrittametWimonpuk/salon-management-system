import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void error
    void info
    // Production telemetry can attach here without exposing runtime details to the UI.
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="feedback-page">
        <div className="feedback-icon danger"><AlertTriangle aria-hidden="true" /></div>
        <p className="eyebrow">SYSTEM ERROR</p>
        <h1>ไม่สามารถแสดงหน้านี้ได้</h1>
        <p>กรุณาโหลดหน้าใหม่ หากปัญหายังคงอยู่ให้ติดต่อผู้ดูแลระบบ</p>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={17} aria-hidden="true" /> โหลดหน้าใหม่
        </button>
      </main>
    )
  }
}
