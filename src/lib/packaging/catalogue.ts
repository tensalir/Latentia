/**
 * Master components-library seed data.
 *
 * Transcribed verbatim from the Components Library sheet of Anna's real
 * Creative Intent workbook (Aphrodite EVT / Black), so the component IDs,
 * display names, descriptions and styles match what her team already uses —
 * C011 really is the rigid box lid, and C005 really is the closure sticker.
 *
 * `style` is hers: a two_face component is printed on both sides and carries
 * Artwork_Front + Artwork_Back; single_face carries one artwork file.
 */

export type ComponentStyle = 'single_face' | 'two_face'

export interface CatalogueSeedEntry {
  code: string
  slug: string
  displayName: string
  description: string
  style: ComponentStyle
  /** false only where Anna has said the part carries no print at all. */
  printed: boolean
  sortOrder: number
}

export const CATALOGUE_SEED: CatalogueSeedEntry[] = [
  { code: 'C001', slug: 'Outer_Sleeve', displayName: 'Outer Sleeve', description: 'Outer paper sleeve that wraps the inner tray.', style: 'two_face', printed: true, sortOrder: 10 },
  { code: 'C002', slug: 'Inner_Tray', displayName: 'Inner Tray', description: 'Folded paper tray that holds the eye mask + accessories.', style: 'two_face', printed: true, sortOrder: 20 },
  // "The tissue paper doesn't need to be printed or anything, but I need to
  // have here on the bottom Pack instructions" — Anna, working session.
  { code: 'C003', slug: 'Tissue_Paper', displayName: 'Tissue Paper', description: 'Pre-dyed inner wrap securing the product inside the tray.', style: 'single_face', printed: false, sortOrder: 30 },
  { code: 'C004', slug: 'Tissue_Sticker', displayName: 'Tissue Sticker', description: 'Decorative or content sticker that closes the tissue wrap.', style: 'single_face', printed: true, sortOrder: 40 },
  { code: 'C005', slug: 'Closure_Sticker', displayName: 'Closure Sticker', description: 'Tear-strip sticker with EAN barcode and SKU colourway info.', style: 'single_face', printed: true, sortOrder: 50 },
  { code: 'C006', slug: 'Hangtag', displayName: 'Hangtag', description: 'Retail/D2C hangtag', style: 'single_face', printed: true, sortOrder: 60 },
  { code: 'C007', slug: 'Insert_Card', displayName: 'Insert Card', description: 'Information / thank-you card.', style: 'two_face', printed: true, sortOrder: 70 },
  { code: 'C008', slug: 'Earplug_Case', displayName: 'Earplug Case', description: 'Hard or soft case for earplug SKUs.', style: 'two_face', printed: true, sortOrder: 80 },
  { code: 'C009', slug: 'Carry_Pouch', displayName: 'Carry Pouch', description: 'Soft carry pouch.', style: 'single_face', printed: true, sortOrder: 90 },
  { code: 'C010', slug: 'Polybag', displayName: 'Polybag', description: 'Outer protective polybag if applicable.', style: 'single_face', printed: true, sortOrder: 100 },
  { code: 'C011', slug: 'Rigid_Box_Lid', displayName: 'Rigid Box - Lid', description: 'Top lid of the inner packaging', style: 'single_face', printed: true, sortOrder: 110 },
  { code: 'C012', slug: 'Rigid_Box_Bottom', displayName: 'Rigid Box - Bottom', description: 'Bottom side of the inner packaging', style: 'single_face', printed: true, sortOrder: 120 },
  { code: 'C013', slug: 'Protection_Insert', displayName: 'Protection Insert', description: '100% reciclable No-woven protective paper', style: 'single_face', printed: true, sortOrder: 130 },
  { code: 'C014', slug: 'Pulp_Tray', displayName: 'Pulp Tray', description: 'Cellulose pre-dyed pulp tray', style: 'single_face', printed: true, sortOrder: 140 },
  { code: 'C015', slug: 'Accessories_Insert', displayName: 'Accessories Insert', description: 'USB-C cable & Extra eartips insert', style: 'two_face', printed: true, sortOrder: 150 },
  { code: 'C016', slug: 'Compliance_Documentation', displayName: 'Compliance Documentation', description: 'Legal compliance documentation booklet', style: 'two_face', printed: true, sortOrder: 160 },
  { code: 'C017', slug: 'User_Guide', displayName: 'User Guide', description: 'How to use / take care guide', style: 'two_face', printed: true, sortOrder: 170 },
]

/** "Aphrodite Sleep Mask" → "aphrodite-sleep-mask" */
export function slugifyProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Anna titles a workbook's project "Aphrodite — EVT": the stage is baked into
 * the name. The stage is already its own field here, so strip a trailing stage
 * suffix rather than minting a second project per stage.
 */
export function stripStageSuffix(name: string): string {
  return name
    .replace(/[\s]*[—–-]{1,2}[\s]*(EVT|DVT|PVT|MP)\s*$/i, '')
    .trim()
}

/** "Rigid box lid" → "Rigid_Box_Lid" (catalogue tab-name form). */
export function slugifyComponentName(displayName: string): string {
  return displayName
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('_')
    .slice(0, 64)
}
