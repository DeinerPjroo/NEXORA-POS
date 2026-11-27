import { defaultPosConfiguration, type PosLayout } from './pos-layout'

// Presets are local drafts; persistence, versions and publication use the existing editor.
export const posTemplates: {
  id: string
  name: string
  description: string
  configuration: PosLayout
}[] = [
  {
    id: 'original',
    name: 'Original',
    description: 'Distribución equilibrada de Nexora Terminal.',
    configuration: defaultPosConfiguration,
  },
  {
    id: 'compact',
    name: 'Compacta',
    description: 'Cuatro columnas y controles compactos para catálogos amplios.',
    configuration: {
      ...defaultPosConfiguration,
      tokens: {
        ...defaultPosConfiguration.tokens,
        order_width: 400,
        category_width: 100,
        product_columns: 4,
        card_height: 80,
        gap: 6,
        radius: 6,
      },
    },
  },
  {
    id: 'touch',
    name: 'Táctil',
    description: 'Dos columnas, texto y botones mayores para atención táctil.',
    configuration: {
      ...defaultPosConfiguration,
      tokens: {
        ...defaultPosConfiguration.tokens,
        product_columns: 2,
        card_height: 104,
        font_size: 16,
        gap: 12,
        radius: 12,
      },
    },
  },
]
