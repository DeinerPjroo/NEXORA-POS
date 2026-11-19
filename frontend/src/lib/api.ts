export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: Record<string, string[]> = {},
  ) {
    super(message)
  }
}

function csrfToken() {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
    ?.slice(11)
  return value ? decodeURIComponent(value) : ''
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const write = method !== 'GET'
  const multipart = options.body instanceof FormData
  try {
    if (write) {
      const csrf = await fetch('/sanctum/csrf-cookie', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!csrf.ok)
        throw new ApiError(csrf.status, 'No se pudo preparar una sesión segura. Intenta de nuevo.')
    }
    const response = await fetch(`/api/v1/${path}`, {
      method,
      credentials: 'include',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        ...(write
          ? {
              'X-XSRF-TOKEN': csrfToken(),
              ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
            }
          : {}),
      },
      ...(options.body !== undefined
        ? { body: multipart ? (options.body as FormData) : JSON.stringify(options.body) }
        : {}),
    })
    if (response.status === 204) return undefined as T
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 423 && data.code === 'screen_locked')
        window.dispatchEvent(new Event('nexora:screen-locked'))
      const messages: Record<number, string> = {
        401: 'Tu sesión ha terminado. Inicia sesión de nuevo.',
        403: 'No tienes permiso para realizar esta acción.',
        404: 'El registro no existe o no está disponible.',
        419: 'La sesión de seguridad venció. Intenta de nuevo.',
        429: 'Has realizado varios intentos. Espera un momento antes de continuar.',
      }
      throw new ApiError(
        response.status,
        messages[response.status] ??
          (response.status >= 500
            ? 'No se pudo conectar con el servicio. Revisa que el servidor y la base de datos estén disponibles.'
            : (data.message ?? 'No se pudo completar la operación.')),
        data.errors,
      )
    }
    return data as T
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError'))
      throw error
    throw new ApiError(
      0,
      'No hay conexión con el servidor. Comprueba tu conexión e intenta de nuevo.',
    )
  }
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError && Object.keys(error.errors).length)
    return Object.values(error.errors).flat().join(' ')
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}
