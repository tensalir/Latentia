/**
 * Master components-library seed data ("every single component that could
 * exist in packaging" — Anna).
 *
 * Component IDs are deliberately left null. In Anna's build_template.py they
 * are generated positionally (`C{index:03d}`) over her own component list, so
 * they identify a row's position rather than the component itself — and none of
 * her lists contain Aphrodite's rigid-box parts. Rather than invent identifiers
 * that would print on supplier documents, the field stays empty for Anna to
 * fill from the library UI, where it is editable.
 */

export interface CatalogueSeedEntry {
  code: string | null
  slug: string
  displayName: string
  printed: boolean
  defaultInCreativeIntent: boolean
  sortOrder: number
  active: boolean
  description?: string
}

export const CATALOGUE_SEED: CatalogueSeedEntry[] = [
  { code: null, slug: 'Rigid_Box_Lid', displayName: 'Rigid box lid', printed: true, defaultInCreativeIntent: true, sortOrder: 10, active: true },
  { code: null, slug: 'Rigid_Box_Bottom', displayName: 'Rigid box bottom', printed: true, defaultInCreativeIntent: true, sortOrder: 20, active: true },
  { code: null, slug: 'Pulp_Tray', displayName: 'Pulp tray', printed: true, defaultInCreativeIntent: true, sortOrder: 30, active: true },
  { code: null, slug: 'Accessories_Insert', displayName: 'Accessories insert', printed: true, defaultInCreativeIntent: true, sortOrder: 40, active: true },
  { code: null, slug: 'Protection_Insert', displayName: 'Protection insert', printed: true, defaultInCreativeIntent: true, sortOrder: 50, active: true },
  { code: null, slug: 'Outer_Sleeve', displayName: 'Outer sleeve', printed: true, defaultInCreativeIntent: true, sortOrder: 60, active: true },
  { code: null, slug: 'User_Guide', displayName: 'User guide', printed: true, defaultInCreativeIntent: true, sortOrder: 70, active: true },
  { code: null, slug: 'Compliance_Documentation', displayName: 'Compliance documentation', printed: true, defaultInCreativeIntent: true, sortOrder: 80, active: true },
  { code: null, slug: 'Hangtag', displayName: 'Hangtag', printed: true, defaultInCreativeIntent: true, sortOrder: 90, active: true },
  { code: null, slug: 'Sticker', displayName: 'Sticker', printed: true, defaultInCreativeIntent: true, sortOrder: 100, active: true },
  { code: null, slug: 'Closure_Sticker', displayName: 'Closure sticker', printed: true, defaultInCreativeIntent: true, sortOrder: 110, active: true },
  {
    code: null,
    slug: 'Tissue_Paper',
    displayName: 'Tissue paper',
    printed: false,
    defaultInCreativeIntent: true,
    sortOrder: 120,
    active: true,
    description: 'Not printed — included for pack instructions in the Creative Intent.',
  },
  { code: null, slug: 'Inner_Tray', displayName: 'Inner tray', printed: true, defaultInCreativeIntent: true, sortOrder: 130, active: true },
  // Portfolio extras carried over from v1 — inactive until a project needs them.
  { code: null, slug: 'Insert_Card', displayName: 'Insert card', printed: true, defaultInCreativeIntent: true, sortOrder: 140, active: false },
  { code: null, slug: 'Polybag', displayName: 'Polybag', printed: false, defaultInCreativeIntent: false, sortOrder: 150, active: false },
  { code: null, slug: 'Master_Carton', displayName: 'Master carton', printed: true, defaultInCreativeIntent: false, sortOrder: 160, active: false },
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
