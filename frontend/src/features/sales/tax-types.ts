export type TaxRate = { name: string; rate: string }
export type TaxProfile = {
  id: number
  name: string
  price_mode: 'inclusive' | 'exclusive'
  rates: TaxRate[]
  revision: number
  is_active: boolean
}
export type TaxChoice = Omit<TaxProfile, 'is_active'>
export type TaxSnapshot = {
  profile_id: number | null
  name: string | null
  price_mode: 'inclusive' | 'exclusive' | 'none'
  rates: TaxRate[]
  revision: number | null
}
export type TaxLine = {
  profile: TaxSnapshot
  amount: string
  base: string
  taxes: (TaxRate & { amount: string })[]
  included_tax_amount: string
  additional_tax_amount: string
  total: string
}
export type TaxBreakdown = {
  items: (TaxLine & {
    order_item_id: number
    product_name: string
    variant_name: string | null
    subtotal: string
    discount_amount: string
  })[]
  tip: TaxLine | null
  included_tax_amount: string
  additional_tax_amount: string
}
export function taxSummary(profile: Pick<TaxChoice, 'price_mode' | 'rates'>) {
  return `${profile.price_mode === 'inclusive' ? 'Incluidos' : 'Adicionales'} · ${profile.rates.map((rate) => `${rate.name} ${rate.rate.replace(/\.?0+$/, '') || '0'} %`).join(' + ')}`
}
export function snapshotChoice(snapshot: TaxSnapshot | null): TaxChoice | null {
  return snapshot?.profile_id &&
    snapshot.name &&
    snapshot.revision &&
    snapshot.price_mode !== 'none'
    ? {
        id: snapshot.profile_id,
        name: snapshot.name,
        revision: snapshot.revision,
        price_mode: snapshot.price_mode,
        rates: snapshot.rates,
      }
    : null
}
