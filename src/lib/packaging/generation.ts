/**
 * "Create supplier packets" — the button.
 *
 * Orchestrates the two outputs Anna's pipeline produces: one supplier PDF per
 * component that has editable artwork, and one Creative Intent PDF for the
 * packet. Failures are isolated per component — a single unreadable .ai must
 * not cost the whole run, and the Creative Intent still builds so the team can
 * see what is and isn't ready.
 */

import pLimit from 'p-limit'
import { prisma } from '@/lib/prisma'
import { formatDateEu } from './format'
import { buildCreativeIntentPdf, type CreativeIntentComponent } from './creative-intent-pdf'
import { buildSupplierPdf } from './supplier-pdf'
import { getPacketOrThrow } from './service'
import {
  creativeIntentPdfStoragePath,
  supplierPdfStoragePath,
} from './storage'
import { downloadPackagingFile, uploadPackagingBuffer } from './signed-upload'

/** Storage reads/writes are network-bound — a few in flight is plenty. */
const IO_CONCURRENCY = 4
/** PDF assembly holds whole artwork buffers in memory; editable .ai files can
 *  be very large, so keep the number of simultaneous builds low. */
const BUILD_CONCURRENCY = 2

type PacketGraph = Awaited<ReturnType<typeof getPacketOrThrow>>
type PacketComponent = PacketGraph['components'][number]

export interface ComponentReadiness {
  componentId: string
  displayName: string
  includedInCreativeIntent: boolean
  printed: boolean
  hasArtwork: boolean
  artworkCompatible: boolean
  hasMockup: boolean
  missingSpecs: string[]
  /** Whether a supplier PDF is expected for this component at all. */
  expectsSupplierPdf: boolean
}

export interface PacketReadiness {
  components: ComponentReadiness[]
  hasOverview: boolean
  warnings: string[]
  /** Generation is never blocked — readiness is advisory, per Anna's rule that
   *  a planned component without files is a normal state. */
  canGenerate: boolean
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function editableArtwork(component: PacketComponent) {
  return component.artworks.filter((a) => a.kind === 'editable_ai').slice(-1)[0] ?? null
}

function mockupArtwork(component: PacketComponent) {
  return component.artworks.filter((a) => a.kind === 'mockup').slice(-1)[0] ?? null
}

/** Pure: summarise what's present and what's missing. Exported for tests. */
export function summarisePacketReadiness(packet: PacketGraph): PacketReadiness {
  const components = packet.components.map<ComponentReadiness>((component) => {
    const artwork = editableArtwork(component)
    const printed = component.componentType.printed
    const missingSpecs: string[] = []
    if (!component.material) missingSpecs.push('Material')
    if (printed && !component.printingMethod) missingSpecs.push('Printing method')
    return {
      componentId: component.id,
      displayName: component.displayName,
      includedInCreativeIntent: component.includeInCreativeIntent,
      printed,
      hasArtwork: Boolean(artwork),
      artworkCompatible: artwork ? artwork.aiCompatible !== false : false,
      hasMockup: Boolean(mockupArtwork(component)),
      missingSpecs,
      expectsSupplierPdf: printed,
    }
  })

  const warnings: string[] = []
  const overview = packet.artworks.find((a) => a.kind === 'overview') ?? null
  if (!overview) warnings.push('No overview render uploaded — the Creative Intent opens on a placeholder.')
  for (const c of components) {
    if (c.expectsSupplierPdf && !c.hasArtwork) {
      warnings.push(`${c.displayName}: no editable artwork yet — no supplier PDF will be produced.`)
    }
    if (c.hasArtwork && !c.artworkCompatible) {
      warnings.push(
        `${c.displayName}: artwork is not PDF-compatible — re-save the .ai with "Create PDF Compatible File".`
      )
    }
    if (c.includedInCreativeIntent && !c.hasMockup) {
      warnings.push(`${c.displayName}: no mockup image — its Creative Intent page shows a placeholder.`)
    }
    if (c.missingSpecs.length > 0) {
      warnings.push(`${c.displayName}: missing ${c.missingSpecs.join(', ')}.`)
    }
  }

  return { components, hasOverview: Boolean(overview), warnings, canGenerate: true }
}

export interface SupplierPdfOutcome {
  componentId: string
  displayName: string
  status: 'generated' | 'skipped' | 'failed'
  reason?: string
  path?: string
  pageCount?: number
}

export interface GenerateResult {
  supplierPdfs: SupplierPdfOutcome[]
  creativeIntent: { status: 'generated' | 'failed'; path?: string; reason?: string }
  readiness: PacketReadiness
}

function infoBoxDataFor(packet: PacketGraph, component: PacketComponent) {
  return {
    projectName: packet.project.name,
    partName: component.displayName,
    date: formatDateEu(packet.artworkDate ?? packet.updatedAt),
    packagingDesigner: packet.project.packagingDesignerName ?? '',
    packagingEngineer: packet.project.packagingEngineerName ?? '',
    graphicDesigner: packet.project.graphicDesignerName ?? '',
    stage: packet.stage,
    material: component.material ?? '',
    printingMethod: component.printingMethod ?? '',
    coatingMsdsRef: component.coatingMsdsRef ?? '',
    skuCode: packet.skuCode ?? packet.variant,
    inks: stringArray(component.inks),
    finishes: stringArray(component.finishes),
    structural: stringArray(component.structuralPlates),
  }
}

/**
 * Stamp one component's supplier brief. Shared by the batch run and the
 * single-component regenerate route so the two can never diverge.
 * Resolves rather than throws — a bad file is an outcome, not an exception.
 */
async function buildOneSupplierPdf(args: {
  packet: PacketGraph
  component: PacketComponent
  fetchPath: (path: string) => Promise<Buffer>
  upload: (path: string, buffer: Buffer) => Promise<void>
}): Promise<SupplierPdfOutcome> {
  const { packet, component } = args
  const base = { componentId: component.id, displayName: component.displayName }
  const artwork = editableArtwork(component)

  if (!artwork) {
    return { ...base, status: 'skipped', reason: 'No editable artwork uploaded yet.' }
  }
  if (artwork.aiCompatible === false) {
    const reason =
      'Artwork is not PDF-compatible — re-save the .ai with "Create PDF Compatible File".'
    await prisma.packagingPacketComponent.update({
      where: { id: component.id },
      data: { supplierPdfError: reason },
    })
    return { ...base, status: 'skipped', reason }
  }

  try {
    const buffer = await args.fetchPath(artwork.storagePath)
    const { bytes, pageCount } = await buildSupplierPdf({
      artwork: buffer,
      data: infoBoxDataFor(packet, component),
    })
    const generatedAt = new Date()
    const path = supplierPdfStoragePath({
      projectSlug: packet.project.slug,
      packetId: packet.id,
      componentSlug: component.componentType.slug,
      printPartNumber: component.printPartNumber,
      generatedAt,
    })
    await args.upload(path, Buffer.from(bytes))
    await prisma.packagingPacketComponent.update({
      where: { id: component.id },
      data: {
        supplierPdfPath: path,
        supplierPdfUrl: null,
        supplierPdfGeneratedAt: generatedAt,
        supplierPdfError: null,
      },
    })
    return { ...base, status: 'generated', path, pageCount }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Supplier PDF failed'
    await prisma.packagingPacketComponent.update({
      where: { id: component.id },
      data: { supplierPdfError: reason },
    })
    return { ...base, status: 'failed', reason }
  }
}

/** Re-stamp a single component after a spec or artwork correction. */
export async function regenerateComponentSupplierPdf(args: {
  packet: PacketGraph
  componentId: string
}): Promise<SupplierPdfOutcome> {
  const component = args.packet.components.find((c) => c.id === args.componentId)
  if (!component) throw new Error('Component not found on this packet')
  return buildOneSupplierPdf({
    packet: args.packet,
    component,
    fetchPath: downloadPackagingFile,
    upload: (path, buffer) =>
      uploadPackagingBuffer({ path, buffer, contentType: 'application/pdf' }),
  })
}

/**
 * Generate everything for a packet. Returns per-output outcomes rather than
 * throwing, so the UI can show exactly which components produced a brief.
 */
export async function generatePacketOutputs(args: {
  packetId: string
  userId: string
}): Promise<GenerateResult> {
  const packet = await getPacketOrThrow(args.packetId)
  const readiness = summarisePacketReadiness(packet)

  await prisma.packagingPacket.update({
    where: { id: packet.id },
    data: { status: 'generating', pdfError: null },
  })

  const io = pLimit(IO_CONCURRENCY)
  const build = pLimit(BUILD_CONCURRENCY)

  // Cache downloads: the Creative Intent needs the same artwork bytes the
  // supplier briefs do, and re-downloading a large .ai twice is wasteful.
  const bytesCache = new Map<string, Promise<Buffer>>()
  const fetchPath = (path: string) => {
    const hit = bytesCache.get(path)
    if (hit) return hit
    const promise = io(() => downloadPackagingFile(path))
    bytesCache.set(path, promise)
    return promise
  }
  const upload = (path: string, buffer: Buffer) =>
    io(() => uploadPackagingBuffer({ path, buffer, contentType: 'application/pdf' }))

  // ── Supplier PDFs ────────────────────────────────────────────────────────
  const supplierPdfs = await Promise.all(
    packet.components.map((component) =>
      build(() => buildOneSupplierPdf({ packet, component, fetchPath, upload }))
    )
  )

  // ── Creative Intent ──────────────────────────────────────────────────────
  let creativeIntent: GenerateResult['creativeIntent']
  try {
    const overview = packet.artworks.find((a) => a.kind === 'overview') ?? null
    const overviewBytes = overview ? await fetchPath(overview.storagePath).catch(() => null) : null

    const included = packet.components.filter((c) => c.includeInCreativeIntent)
    const ciComponents: CreativeIntentComponent[] = await Promise.all(
      included.map(async (component) => {
        const artwork = editableArtwork(component)
        const mockup = mockupArtwork(component)
        // A missing or unreadable file is a placeholder, never a failure.
        const artworkBytes =
          artwork && artwork.aiCompatible !== false
            ? await fetchPath(artwork.storagePath).catch(() => null)
            : null
        const mockupBytes = mockup ? await fetchPath(mockup.storagePath).catch(() => null) : null
        const stepImages = await Promise.all(
          component.packSteps.map((step) =>
            step.imagePath ? fetchPath(step.imagePath).catch(() => null) : Promise.resolve(null)
          )
        )
        return {
          displayName: component.displayName,
          code: component.componentType.code,
          printed: component.componentType.printed,
          material: component.material,
          printingMethod: component.printingMethod,
          coatingMsdsRef: component.coatingMsdsRef,
          paperThickness: component.paperThickness,
          drawingPartNumber: component.drawingPartNumber,
          approvalStatus: component.approvalStatus,
          engineerNotes: component.engineerNotes,
          inks: stringArray(component.inks),
          finishes: stringArray(component.finishes),
          structural: stringArray(component.structuralPlates),
          printPartNumber: component.printPartNumber,
          mockupBytes: mockupBytes ? new Uint8Array(mockupBytes) : null,
          artworkBytes: artworkBytes ? new Uint8Array(artworkBytes) : null,
          packSteps: component.packSteps.map((step, i) => ({
            stepNumber: step.stepNumber,
            instruction: step.instruction,
            imageBytes: stepImages[i] ? new Uint8Array(stepImages[i]!) : null,
          })),
        }
      })
    )

    const bytes = await buildCreativeIntentPdf({
      projectName: packet.project.name,
      productType: packet.project.productType,
      supplier: packet.project.supplier,
      stage: packet.stage,
      variant: packet.variant,
      skuCode: packet.skuCode,
      date: formatDateEu(packet.artworkDate ?? packet.updatedAt),
      packagingDesigner: packet.project.packagingDesignerName,
      graphicDesigner: packet.project.graphicDesignerName,
      packagingEngineer: packet.project.packagingEngineerName,
      overviewBytes: overviewBytes ? new Uint8Array(overviewBytes) : null,
      components: ciComponents,
    })

    const generatedAt = new Date()
    const path = creativeIntentPdfStoragePath({
      projectSlug: packet.project.slug,
      packetId: packet.id,
      projectName: packet.project.name,
      stage: packet.stage,
      variant: packet.variant,
      generatedAt,
    })
    await io(() =>
      uploadPackagingBuffer({ path, buffer: Buffer.from(bytes), contentType: 'application/pdf' })
    )
    await prisma.packagingPacket.update({
      where: { id: packet.id },
      data: {
        creativeIntentPdfPath: path,
        creativeIntentPdfUrl: null,
        creativeIntentPdfGeneratedAt: generatedAt,
        status: 'ready',
        pdfError: null,
      },
    })
    creativeIntent = { status: 'generated', path }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Creative Intent PDF failed'
    await prisma.packagingPacket.update({
      where: { id: packet.id },
      data: { status: 'failed', pdfError: reason },
    })
    creativeIntent = { status: 'failed', reason }
  }

  return { supplierPdfs, creativeIntent, readiness }
}
