/**
 * Loop packaging component catalog — mirrors loop-packaging-system skill.
 */

export type ComponentStyle = 'two_face' | 'single_face'

export interface PackagingComponentDef {
  slug: string
  displayName: string
  description: string
  style: ComponentStyle
  hasPackingBlock: boolean
}

export const NYX_COMPONENTS: PackagingComponentDef[] = [
  { slug: 'Outer_Sleeve', displayName: 'Outer Sleeve', description: 'Outer paper sleeve that wraps the inner tray.', style: 'two_face', hasPackingBlock: false },
  { slug: 'Inner_Tray', displayName: 'Inner Tray', description: 'Folded paper tray that holds the eye mask + accessories.', style: 'two_face', hasPackingBlock: false },
  { slug: 'Tissue_Paper', displayName: 'Tissue Paper', description: 'Pre-dyed inner wrap securing the product inside the tray.', style: 'single_face', hasPackingBlock: true },
  { slug: 'Tissue_Sticker', displayName: 'Tissue Sticker', description: 'Decorative or content sticker that closes the tissue wrap.', style: 'single_face', hasPackingBlock: true },
  { slug: 'Closure_Sticker', displayName: 'Closure Sticker', description: 'Tear-strip sticker with EAN barcode and SKU colourway info.', style: 'single_face', hasPackingBlock: true },
]

export const PORTFOLIO_COMPONENTS: PackagingComponentDef[] = [
  { slug: 'Hangtag', displayName: 'Hangtag', description: 'Retail/D2C hangtag.', style: 'single_face', hasPackingBlock: false },
  { slug: 'Insert_Card', displayName: 'Insert Card', description: 'Information / thank-you card.', style: 'two_face', hasPackingBlock: false },
  { slug: 'Earplug_Case', displayName: 'Earplug Case', description: 'Hard or soft case for earplug SKUs.', style: 'two_face', hasPackingBlock: false },
  { slug: 'Carry_Pouch', displayName: 'Carry Pouch', description: 'Soft carry pouch.', style: 'single_face', hasPackingBlock: false },
  { slug: 'Polybag', displayName: 'Polybag', description: 'Outer protective polybag if applicable.', style: 'single_face', hasPackingBlock: false },
  { slug: 'Master_Carton', displayName: 'Master Carton', description: 'Master carton for bulk shipment.', style: 'two_face', hasPackingBlock: false },
]

export const ALL_PACKAGING_COMPONENTS = [...NYX_COMPONENTS, ...PORTFOLIO_COMPONENTS]

export const PACKAGING_STAGES = ['EVT', 'DVT', 'PVT', 'MP'] as const
export type PackagingStage = (typeof PACKAGING_STAGES)[number]

export const SPEC_FIELDS = [
  'Drawing Part Number',
  'Print Part Number',
  'Material',
  'Inks / Print',
  'Finishes',
  'Special Effects',
  'Printing Method',
  'Coating MSDS Ref.',
  'Approval Status',
  'Notes',
] as const

export function getComponentDef(slug: string): PackagingComponentDef | undefined {
  return ALL_PACKAGING_COMPONENTS.find((c) => c.slug === slug)
}

export function slugFromProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80)
}
