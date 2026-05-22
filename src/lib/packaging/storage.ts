/**
 * Storage path conventions for Packaging Studio.
 * Uses dedicated `packaging-files` bucket (private; signed URLs for reads).
 */

export const PACKAGING_STORAGE_BUCKET = 'packaging-files'

export function importStoragePath(ownerId: string, importId: string): string {
  return `packaging/${ownerId}/imports/${importId}.xlsx`
}

export function artworkStoragePath(args: {
  ownerId: string
  packetId: string
  componentSlug: string
  kind: string
  fileName: string
}): string {
  const safe = safeFileSlug(args.fileName)
  const ext = safe.includes('.') ? '' : ''
  return `packaging/${args.ownerId}/packets/${args.packetId}/components/${args.componentSlug}/${args.kind}-${safe}${ext}`
}

export function supplierPdfStoragePath(
  ownerId: string,
  packetId: string,
  componentSlug: string
): string {
  return `packaging/${ownerId}/packets/${packetId}/components/${componentSlug}/supplier.pdf`
}

export function creativeIntentPdfStoragePath(
  ownerId: string,
  packetId: string,
  fileSlug: string
): string {
  return `packaging/${ownerId}/packets/${packetId}/${safeFileSlug(fileSlug)}_Creative_Intent.pdf`
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

export function publicUrlForPackagingPath(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${PACKAGING_STORAGE_BUCKET}/${path}`
}

export function signedUrlPath(path: string): string {
  return path
}
