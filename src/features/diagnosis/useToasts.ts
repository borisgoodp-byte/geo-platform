import { useCallback, useRef, useState } from 'react'

export interface ToastItem {
  id: number
  kind: 'success' | 'error' | 'info'
  text: string
}

/** 轻量 Toast（App.tsx 红线内无法挂载全局 Toaster，页面级自给自足） */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, kind, text }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])
  return { toasts, push }
}
