/**
 * Resolved document model for Creative Intent HTML preview + export gating.
 */

export interface PackagingDocumentDraft {
  coverTitle?: string
  coverSubtitle?: string
  packetNotes?: string
  componentOrder?: string[]
}

export interface PackagingReadiness {
  ready: boolean
  missingSupplierPdfs: string[]
  missingArtwork: string[]
  reasons: string[]
}

export function evaluatePacketReadiness(packet: {
  components: Array<{
    slug: string
    displayName: string
    included: boolean
    supplierPdfUrl: string | null
    artworks: Array<{ kind: string; storagePath: string }>
  }>
}): PackagingReadiness {
  const missingSupplierPdfs: string[] = []
  const missingArtwork: string[] = []
  const reasons: string[] = []

  for (const c of packet.components.filter((x) => x.included)) {
    if (!c.supplierPdfUrl) missingSupplierPdfs.push(c.slug)
    const editable = c.artworks.find(
      (a) => a.kind === 'Artwork' || a.kind === 'Artwork_Front'
    )
    if (!c.artworks.length && !editable) {
      missingArtwork.push(c.slug)
    }
  }

  if (missingSupplierPdfs.length) {
    reasons.push(`${missingSupplierPdfs.length} component(s) missing supplier PDF`)
  }

  return {
    ready: missingSupplierPdfs.length === 0 && packet.components.some((c) => c.included),
    missingSupplierPdfs,
    missingArtwork,
    reasons,
  }
}
