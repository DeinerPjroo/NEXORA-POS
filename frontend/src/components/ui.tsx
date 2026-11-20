import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowRight, Check, LoaderCircle, X } from 'lucide-react'
import { errorText } from '../lib/api'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        N<span />
      </span>
      {!compact && (
        <span>
          nexora<span className="brand-pos">POS</span>
        </span>
      )}
    </div>
  )
}

export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="notice error" role="alert">
      <AlertCircle size={18} />
      <span>{errorText(error)}</span>
    </div>
  ) : null
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>Cargando tu espacio de trabajo…</span>
      <div className="skeleton-row" />
      <div className="skeleton-row short" />
    </div>
  )
}

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  const id = useRef(`field-${crypto.randomUUID()}`)
  return (
    <div className="field">
      <label htmlFor={id.current}>{label}</label>
      <div
        className="field-control"
        ref={(node) => {
          const control = node?.querySelector('input,select,textarea')
          if (control) {
            control.id = id.current
            if (hint) control.setAttribute('aria-describedby', `${id.current}-hint`)
          }
        }}
      >
        {children}
      </div>
      {hint && <small id={`${id.current}-hint`}>{hint}</small>}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  className = 'modal',
  locked = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
  locked?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className={className}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!locked) onClose()
      }}
      onClick={(event) => {
        if (!locked && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar"
          disabled={locked}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}

const ToastContext = createContext<(message: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4500)
      return () => clearTimeout(timer)
    }
  }, [message])
  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      {message && (
        <div className="toast" role="status">
          <Check size={19} />
          {message}
          <button
            className="icon-button"
            aria-label="Cerrar notificación"
            onClick={() => setMessage('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}
export function useToast() {
  return useContext(ToastContext)
}
export function Submit({
  pending,
  disabled = false,
  children = 'Guardar cambios',
}: {
  pending: boolean
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <button className="button primary" type="submit" disabled={pending || disabled}>
      {pending ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
      {pending ? 'Guardando…' : children}
    </button>
  )
}
export function ArrowLink() {
  return <ArrowRight size={17} />
}
