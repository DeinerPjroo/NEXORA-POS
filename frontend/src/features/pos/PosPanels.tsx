import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { CatalogPage, CategorySummary } from '../catalog/types'
import { ErrorNotice } from '../../components/ui'

export const defaultPosLayout = {
  schemaVersion: 1,
  panels: ['actions', 'order', 'categories', 'products'],
  orderWidth: 560,
  categoryWidth: 110,
  productColumns: 3,
} as const

export function PosCategories({
  value,
  onChange,
  disabled,
}: {
  value: CategorySummary | null
  onChange: (category: CategorySummary | null) => void
  disabled: boolean
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['pos-categories', page],
    queryFn: ({ signal }) =>
      api<CatalogPage<CategorySummary>>(`categories?status=active&per_page=30&page=${page}`, {
        signal,
      }),
  })
  return (
    <nav className="pos-categories" aria-label="Categorías del terminal" data-pos-slot="categories">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!value}
        onClick={() => onChange(null)}
      >
        Todos
      </button>
      <ErrorNotice error={query.error} />
      {query.data?.data.map((category) => (
        <button
          type="button"
          key={category.id}
          disabled={disabled || !category.effective_active}
          aria-pressed={category.id === value?.id}
          style={{ borderLeftColor: category.color }}
          onClick={() => onChange(category)}
        >
          {category.name}
        </button>
      ))}
      {(query.data?.meta.last_page ?? 1) > 1 && (
        <div className="pos-category-pages">
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ‹
          </button>
          <button
            type="button"
            disabled={page >= (query.data?.meta.last_page ?? 1)}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
      )}
    </nav>
  )
}

export function PosKeypad({
  disabled,
  onApply,
  label,
}: {
  disabled: boolean
  onApply: (quantity: number) => void
  label: string
}) {
  const [value, setValue] = useState('1')
  const [replace, setReplace] = useState(true)
  return (
    <section className="pos-keypad" aria-label="Teclado de cantidad" data-pos-slot="keypad">
      <div className="pos-keypad-value">
        <span>{label}</span>
        <output aria-live="polite">{value || '0'}</output>
      </div>
      <div className="pos-keypad-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map((key) => (
          <button
            type="button"
            disabled={disabled}
            key={key}
            aria-label={
              key === '✓' ? 'Aplicar cantidad' : key === 'C' ? 'Borrar cantidad' : `Cantidad ${key}`
            }
            onClick={() => {
              if (key === 'C') {
                setValue('')
                setReplace(true)
              } else if (key === '✓') {
                const quantity = Number(value)
                if (quantity >= 1 && quantity <= 999) {
                  onApply(quantity)
                  setReplace(true)
                }
              } else {
                setValue((previous) => (replace ? key : previous + key).slice(0, 3))
                setReplace(false)
              }
            }}
          >
            {key}
          </button>
        ))}
      </div>
    </section>
  )
}
