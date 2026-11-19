export type Geometry = { x: number; y: number; width: number; height: number; rotation: number }
export type DiningTable = Geometry & {
  id: number
  branch_id: number
  dining_room_id: number
  name: string
  shape: 'circle' | 'square' | 'rectangle'
  color: string
  capacity: number
  is_active: boolean
  revision: number
}
export type LayoutObject = Geometry & {
  id: string
  kind: 'wall' | 'door' | 'divider' | 'decoration'
  label: string
  color: string
}
export type DiningRoom = {
  id: number
  branch_id: number
  name: string
  color: string
  is_active: boolean
  revision: number
  layout_schema_version: number
  branch: { id: number; name: string; is_active: boolean }
  objects: LayoutObject[]
  tables?: DiningTable[]
}
