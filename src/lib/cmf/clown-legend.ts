/**
 * Canonical clown-legend colours for CMF PDF swatches.
 *
 * Damien's convention: swatches on Page 1, Part Break Down, and Pack
 * overview are *region markers* that match the painted regions on the
 * clown reference render — not the product's actual Pantone. A reader
 * maps green on the clown → POM ring via the legend, then finds the
 * same green chip next to "POM ring" in the breakdown grid.
 *
 * Per-asset `CmfClownAsset.components` colour metadata overrides this map
 * when present (non-standard explorers). Otherwise we fall back to the
 * canonical table below.
 */

/** Region key → hex. Switch 2 only today; other products keep comp.colorHex. */
export const CMF_LEGEND_COLOURS: Record<string, string> = {
  pom_ring: '#2BA34D',
  cosmetic_cap: '#1F6FB8',
  nozzle_piece: '#D0342C',
  eartip: '#E45BA0',
  // artwork intentionally absent — no swatch until Damien defines it
}

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

/**
 * Resolve the hex to paint for a component swatch.
 * Priority: per-asset clown metadata → canonical map → null (caller may
 * fall back to comp.colorHex).
 */
export function resolveLegendHex(
  comp: LegendComponentRef,
  clownComponents?: ClownLegendEntry[] | null,
): string | null {
  const fromAsset = clownComponents?.find((c) => c.region === comp.region)?.colorHex
  if (fromAsset) return fromAsset
  return CMF_LEGEND_COLOURS[comp.region] ?? null
}
