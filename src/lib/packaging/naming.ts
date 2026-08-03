/**
 * Loop packaging file-naming convention (folder_naming_spec.md, canonical):
 *
 *   {Component}[__{Variant}]_{Ref}_{Product}_{Stage}_{DDMMYY}_{Type}.ext
 *
 * e.g. `Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai`
 *
 * The component token must match a catalogue slug exactly — that is what the
 * sync step matches on (longest-prefix wins). `{Variant}` is separated by a
 * DOUBLE underscore and appears only on SKU-specific files.
 */

export const PACKAGING_STAGES = ['EVT', 'DVT', 'PVT', 'MP'] as const
export type PackagingStage = (typeof PACKAGING_STAGES)[number]

export interface ParsedArtworkName {
  /** Component token, e.g. "Rigid_Box_Lid" */
  component: string
  /** Colourway after the double underscore, e.g. "Black" (null when shared) */
  variant: string | null
  /** Internal reference, e.g. "A120" */
  ref: string | null
  product: string | null
  stage: PackagingStage | null
  /** Artwork cut date token, DDMMYY */
  dateToken: string | null
  /** File type marker: ED (editable) | OL (outline) | other */
  typeMarker: string | null
  extension: string
  /** The stem (filename without extension) — used as Print Part Number. */
  stem: string
}

export function stemOf(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '')
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/**
 * Match an artwork stem to one of the packet's component slugs.
 * Longest-prefix wins so `Rigid_Box_Lid` beats `Rigid_Box`; the token after
 * the slug must be `_` (next field) or `__` (variant) so `Pulp_Tray_Liner`
 * never matches the `Pulp_Tray` slug.
 */
export function matchComponentSlug(stemOrFileName: string, slugs: string[]): string | null {
  const stem = stemOf(stemOrFileName)
  let best: string | null = null
  for (const slug of slugs) {
    if (stem === slug || stem.startsWith(`${slug}_`)) {
      if (!best || slug.length > best.length) best = slug
    }
  }
  return best
}

/**
 * Parse a filename against the convention. Best-effort: unknown segments are
 * null rather than errors — validation messages come from `validateArtworkName`.
 */
export function parseArtworkName(fileName: string, knownSlugs: string[]): ParsedArtworkName {
  const base = fileName.replace(/^.*[\\/]/, '')
  const dot = base.lastIndexOf('.')
  const extension = dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
  const stem = dot > 0 ? base.slice(0, dot) : base

  const component = matchComponentSlug(stem, knownSlugs)
  let rest = component ? stem.slice(component.length) : stem

  let variant: string | null = null
  if (component && rest.startsWith('__')) {
    const after = rest.slice(2)
    const cut = after.indexOf('_')
    variant = cut === -1 ? after : after.slice(0, cut)
    rest = cut === -1 ? '' : after.slice(cut)
  }

  const tokens = rest.split('_').filter(Boolean)
  let ref: string | null = null
  let product: string | null = null
  let stage: PackagingStage | null = null
  let dateToken: string | null = null
  let typeMarker: string | null = null

  for (const token of tokens) {
    const up = token.toUpperCase()
    if (!stage && (PACKAGING_STAGES as readonly string[]).includes(up)) {
      stage = up as PackagingStage
    } else if (!dateToken && /^\d{6}$/.test(token)) {
      dateToken = token
    } else if (!ref && /^[A-Z]\d{2,}$/i.test(token)) {
      ref = token
    } else if (/^(ED|OL)$/i.test(token)) {
      typeMarker = up
    } else if (!product) {
      product = token
    }
  }

  return { component: component ?? '', variant, ref, product, stage, dateToken, typeMarker, extension, stem }
}

export interface NameValidation {
  valid: boolean
  problems: string[]
}

/**
 * Human-readable validation for upload feedback. Warnings, not blockers —
 * the tool accepts loosely named files but tells the uploader what the
 * convention expects (machine matching quality depends on it).
 */
export function validateArtworkName(
  fileName: string,
  opts: { expectedSlug?: string; knownSlugs?: string[]; expectedStage?: string } = {}
): NameValidation {
  const problems: string[] = []
  const base = fileName.replace(/^.*[\\/]/, '')
  const parsed = parseArtworkName(base, opts.knownSlugs ?? (opts.expectedSlug ? [opts.expectedSlug] : []))

  if (/\s/.test(base)) problems.push('Filename contains spaces — use snake_case.')
  if (/(final|v\d+|updated|copy)/i.test(base)) {
    problems.push('No noise words (final, v2, updated, copy) — the stage folder is the version.')
  }
  if (opts.expectedSlug && parsed.component !== opts.expectedSlug) {
    problems.push(
      `Component token should lead the filename and match "${opts.expectedSlug}" exactly.`
    )
  }
  if (opts.expectedStage && parsed.stage && parsed.stage !== opts.expectedStage.toUpperCase()) {
    problems.push(`Stage token is ${parsed.stage}; this packet is ${opts.expectedStage}.`)
  }
  if (!parsed.dateToken) problems.push('Missing DDMMYY artwork-cut date token.')

  return { valid: problems.length === 0, problems }
}
