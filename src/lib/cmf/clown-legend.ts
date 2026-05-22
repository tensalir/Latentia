/**
 * Canonical clown-legend colours for CMF PDF swatches.
 *
 * Damien's convention: swatches on Page 1, Part Break Down, and Pack
 * overview are *region markers* that match the painted regions on the
 * clown reference render — not the product's actual Pantone. A reader
 * maps green on the clown → POM ring via the legend, then finds the
 * same green chip next to "POM ring" in the breakdown grid.
 *
 * When a SKU has a clown attached, we must never paint swatches from
 * `comp.colorHex` (workbook / product render). That path is only for
 * SKUs without a clown reference.
 */

/** Loop explorer palette: red, green, blue, yellow, pink (5th region). */
export const CMF_EXPLORER_PALETTE = [
  '#D0342C',
  '#2BA34D',
  '#1F6FB8',
  '#F5C542',
  '#E45BA0',
] as const

/** Per-product region → clown legend hex (overrides positional palette). */
export const CMF_LEGEND_BY_PRODUCT: Record<string, Record<string, string>> = {
  switch2: {
    pom_ring: '#2BA34D',
    cosmetic_cap: '#1F6FB8',
    nozzle_piece: '#D0342C',
    eartip: '#E45BA0',
  },
}

/** @deprecated Use CMF_LEGEND_BY_PRODUCT.switch2 — kept for tests. */
export const CMF_LEGEND_COLOURS = CMF_LEGEND_BY_PRODUCT.switch2

export interface LegendComponentRef {
  region: string
  label?: string
  colorHex?: string | null
}

export type ClownLegendEntry = {
  region: string
  label: string
  colorHex?: string | null
}

export interface ResolveLegendOptions {
  productSlug?: string
  /** Catalog region order — used for explorer-palette fallback on non-Switch2 products. */
  catalogRegions?: string[]
}

/**
 * Resolve the hex to paint for a component swatch (clown legend only).
 * Priority: per-asset metadata → product map → explorer palette by
 * catalog index → null.
 */
export function resolveLegendHex(
  comp: LegendComponentRef,
  clownComponents?: ClownLegendEntry[] | null,
  options?: ResolveLegendOptions,
): string | null {
  const fromAsset = clownComponents?.find((c) => c.region === comp.region)?.colorHex
  if (fromAsset) return fromAsset

  if (options?.productSlug) {
    const productMap = CMF_LEGEND_BY_PRODUCT[options.productSlug]
    if (productMap?.[comp.region]) return productMap[comp.region]

    const regions = options.catalogRegions
    if (regions?.length) {
      const idx = regions.indexOf(comp.region)
      if (idx >= 0 && idx < CMF_EXPLORER_PALETTE.length) {
        return CMF_EXPLORER_PALETTE[idx]
      }
    }
  }

  // Legacy: callers without productSlug (tests) still resolve Switch 2 keys.
  return CMF_LEGEND_COLOURS[comp.region] ?? null
}

export interface SwatchContext {
  hasClown: boolean
  clownComponents?: ClownLegendEntry[] | null
  productSlug?: string
  catalogRegions?: string[]
}

/**
 * Hex for a PDF swatch chip. When `hasClown` is true, only clown-legend
 * colours apply — never the product render / workbook Pantone.
 */
export function resolveSwatchHex(
  comp: LegendComponentRef,
  ctx: SwatchContext,
): string | null {
  if (ctx.hasClown) {
    return resolveLegendHex(comp, ctx.clownComponents ?? null, {
      productSlug: ctx.productSlug,
      catalogRegions: ctx.catalogRegions,
    })
  }
  return comp.colorHex ?? null
}
