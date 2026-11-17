import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'

export function useOperation<T>(path: string, onSuccess: (result: T) => void | Promise<void>) {
  const [key, setKey] = useState(() => crypto.randomUUID())
  const last = useRef<Record<string, unknown> | null>(null)
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ data: T }>(path, { method: 'POST', body }),
    onSuccess: async (result) => {
      await onSuccess(result.data)
      last.current = null
      setKey(crypto.randomUUID())
    },
  })
  const uncertain =
    mutation.error instanceof ApiError &&
    (mutation.error.status === 0 || mutation.error.status >= 500)
  function send(data: Record<string, unknown>) {
    const body = uncertain && last.current ? last.current : { ...data, idempotency_key: key }
    last.current = body
    mutation.mutate(body)
  }
  return { ...mutation, send, uncertain, locked: mutation.isPending || uncertain }
}
