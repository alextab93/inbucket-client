export type ToastKind = 'error' | 'success' | 'info'

export interface ToastDetail {
  message: string
  kind: ToastKind
}

export const showToast = (message: string, kind: ToastKind = 'info') => {
  window.dispatchEvent(new CustomEvent<ToastDetail>('inbucket:toast', { detail: { message, kind } }))
}
