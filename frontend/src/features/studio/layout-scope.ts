export type LayoutScope = {
  device: 'adaptive' | 'desktop' | 'tablet' | 'mobile'
  role_id: number | null
}
export const defaultLayoutScope: LayoutScope = { device: 'adaptive', role_id: null }
export function scopeQuery(scope: LayoutScope) {
  const params = new URLSearchParams({ device: scope.device })
  if (scope.role_id !== null) params.set('role_id', String(scope.role_id))
  return params.toString()
}
