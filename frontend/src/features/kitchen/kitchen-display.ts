export type KitchenDisplay = {
  schema_version: 1
  labels: Record<'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled', string>
  warning_minutes: number
  overdue_alert: boolean
}
export const defaultKitchenDisplay: KitchenDisplay = {
  schema_version: 1,
  labels: {
    new: 'Nuevas',
    preparing: 'En preparación',
    ready: 'Terminadas',
    delivered: 'Entregadas',
    cancelled: 'Canceladas',
  },
  warning_minutes: 0,
  overdue_alert: true,
}
