const signedPath =
  /^\/api\/v1\/auth\/email\/verify\/[1-9][0-9]*\/[a-f0-9]{40}\?expires=[0-9]+&signature=[a-f0-9]{64}$/

export function verificationApiPath(value: string | null): string | null {
  return value && value.length < 500 && signedPath.test(value)
    ? value.slice('/api/v1/'.length)
    : null
}

export function verificationReturn(value: string | null): string | null {
  return verificationApiPath(value)
    ? `/verificar-correo?verificacion=${encodeURIComponent(value!)}`
    : null
}
