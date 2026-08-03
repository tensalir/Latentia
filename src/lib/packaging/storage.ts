/**
 * Storage path conventions for Packaging Studio v2.
 * Dedicated private `packaging-files` bucket; reads via signed URLs only.
 *
 * Layout mirrors Anna's stage-folder thinking, keyed by packet:
 *   packaging/{projectSlug}/{packetId}/components/{slug}/…
 * Supplier PDFs live under `supplier_out/` — her convention that stamped
 * briefs never sit next to clean artwork.
 */

export const PACKAGING_STORAGE_BUCKET = 'packaging-files'

export type PackagingArtworkKind = 'editable_ai' | 'mockup' | 'overview' | 'step_image'

export function artworkStoragePath(args: {
  projectSlug: string
  packetId: string
  componentSlug?: string | null
  kind: PackagingArtworkKind
  fileName: string
}): string {
  const safe = safeFileSlug(args.fileName)
  const base = `packaging/${args.projectSlug}/${args.packetId}`
  if (args.kind === 'overview') return `${base}/overview/${safe}`
  const slug = args.componentSlug ?? '_unassigned'
  if (args.kind === 'step_image') return `${base}/components/${slug}/steps/${safe}`
  return `${base}/components/${slug}/${args.kind}-${safe}`
}

/**
 * Generated PDFs get a version suffix rather than overwriting in place. A brief
 * may already be sitting in a supplier's inbox when someone re-generates, so the
 * old bytes must stay retrievable at the URL that was shared. The database
 * column always points at the newest.
 */
export function versionSuffix(generatedAt: Date): string {
  // Sortable, filename-safe, minute resolution — enough to distinguish runs
  // without making the name unreadable.
  return generatedAt.toISOString().replace(/[-:T]/g, '').slice(0, 12)
}

export function supplierPdfStoragePath(args: {
  projectSlug: string
  packetId: string
  componentSlug: string
  printPartNumber?: string | null
  generatedAt?: Date
}): string {
  const stem = safeFileSlug(args.printPartNumber || `${args.componentSlug}_supplier`)
  const version = args.generatedAt ? `_${versionSuffix(args.generatedAt)}` : ''
  return `packaging/${args.projectSlug}/${args.packetId}/components/${args.componentSlug}/supplier_out/${stem}_supplier${version}.pdf`
}

export function creativeIntentPdfStoragePath(args: {
  projectSlug: string
  packetId: string
  projectName: string
  stage: string
  variant: string
  generatedAt?: Date
}): string {
  const stem = safeFileSlug(`${args.projectName}_${args.stage}_Creative_Intent_${args.variant}`)
  const version = args.generatedAt ? `_${versionSuffix(args.generatedAt)}` : ''
  return `packaging/${args.projectSlug}/${args.packetId}/${stem}${version}.pdf`
}

export function importStoragePath(ownerId: string, importId: string): string {
  return `packaging/_imports/${ownerId}/${importId}.xlsx`
}

export function safeFileSlug(input: string): string {
  return input
    .replace(/\.+/g, '.')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/(^|_)[.]+(?=_|$)/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120)
}
