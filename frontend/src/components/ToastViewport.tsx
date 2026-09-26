import { useEffect, useState } from 'react'
import type { ToastDetail } from '../toast'

interface Toast extends ToastDetail {
  id: number
}

export const ToastViewport = () => {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail
      const id = Date.now() + Math.random()
      setToasts((current) => [...current, { ...detail, id }])
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 6000)
    }
    window.addEventListener('inbucket:toast', receive)
    return () => window.removeEventListener('inbucket:toast', receive)
  }, [])

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((candidate) => candidate.id !== toast.id))}>×</button>
        </div>
      ))}
    </div>
  )
}
