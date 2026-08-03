/**
 * DTO shaping for the packaging API. Kept in one place so every route returns
 * the same shapes and the client hook has a single set of types to mirror.
 *
 * Storage paths are private; reads get short-lived signed URLs minted per
 * response rather than persisted (v1 stored 1h URLs as if permanent).
 */

import type { Prisma } from '@prisma/client'
import { getPackagingSignedDownloadUrl } from './signed-upload'
import type { PACKAGING_STAGES } from './naming'
import type { PACKET_INCLUDE } from './service'

/** The packet shape `PACKET_INCLUDE` produces — keeps this module in step with
 *  the query without restating every field. */
export type PacketWithGraph = Prisma.PackagingPacketGetPayload<{
  include: typeof PACKET_INCLUDE
}>

const SIGNED_URL_TTL_SECONDS = 3600

export interface ComponentTypeDto {
  id: string
  code: string | null
  slug: string
  displayName: string
  description: string | null
  printed: boolean
  style: string
  defaultInCreativeIntent: boolean
  sortOrder: number
  active: boolean
  inUse?: boolean
}

export interface PackagingArtworkDto {
  id: string
  kind: string
  fileName: string
  storagePath: string
  mimeType: string | null
  byteSize: number | null
  pageCount: number | null
  aiCompatible: boolean | null
  extractedPlates: unknown
  extractedAt: string | null
  downloadUrl: string | null
  createdAt: string
}

export interface PackStepDto {
  id: string
  stepNumber: number
  instruction: string
  imagePath: string | null
  imageFileName: string | null
  imageUrl: string | null
}

export interface PacketComponentDto {
  id: string
  componentTypeId: string
  slug: string
  code: string | null
  displayName: string
  printed: boolean
  style: string
  includeInCreativeIntent: boolean
  pageOrder: number
  material: string | null
  printingMethod: string | null
  coatingMsdsRef: string | null
  paperThickness: string | null
  drawingPartNumber: string | null
  approvalStatus: string
  engineerNotes: string | null
  pdfPageTitle: string | null
  perProductNotes: string | null
  heightMm: string | null
  widthMm: string | null
  depthMm: string | null
  netWeightG: string | null
  stickerPlacement: string | null
  inks: string[]
  finishes: string[]
  structuralPlates: string[]
  printPartNumber: string | null
  platesSyncedAt: string | null
  supplierPdfUrl: string | null
  supplierPdfGeneratedAt: string | null
  supplierPdfError: string | null
  artworks: PackagingArtworkDto[]
  packSteps: PackStepDto[]
}

export interface PacketDto {
  id: string
  projectId: string
  stage: (typeof PACKAGING_STAGES)[number] | string
  variant: string
  skuCode: string | null
  artworkDate: string | null
  status: string
  creativeIntentPdfUrl: string | null
  creativeIntentPdfGeneratedAt: string | null
  pdfError: string | null
  lastExportedAt: string | null
  updatedAt: string
  project: ProjectDto
  components: PacketComponentDto[]
  overview: PackagingArtworkDto | null
}

export interface ProjectDto {
  id: string
  name: string
  slug: string
  productType: string | null
  productFamily: string | null
  supplier: string | null
  internalRef: string | null
  fileLocationUrl: string | null
  packagingDesignerName: string | null
  graphicDesignerName: string | null
  packagingEngineerName: string | null
  notes: string | null
  updatedAt: string
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Mint a signed URL, swallowing failures (a missing object shouldn't 500 a read). */
async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  try {
    return await getPackagingSignedDownloadUrl(path, SIGNED_URL_TTL_SECONDS)
  } catch {
    return null
  }
}

export function serializeComponentType(row: {
  id: string
  code: string | null
  slug: string
  displayName: string
  description: string | null
  printed: boolean
  style: string
  defaultInCreativeIntent: boolean
  sortOrder: number
  active: boolean
  _count?: { packetComponents: number }
}): ComponentTypeDto {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    printed: row.printed,
    style: row.style,
    defaultInCreativeIntent: row.defaultInCreativeIntent,
    sortOrder: row.sortOrder,
    active: row.active,
    inUse: row._count ? row._count.packetComponents > 0 : undefined,
  }
}

export function serializeProject(row: {
  id: string
  name: string
  slug: string
  productType: string | null
  productFamily: string | null
  supplier: string | null
  internalRef: string | null
  fileLocationUrl: string | null
  packagingDesignerName: string | null
  graphicDesignerName: string | null
  packagingEngineerName: string | null
  notes: string | null
  updatedAt: Date
}): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    productType: row.productType,
    productFamily: row.productFamily,
    supplier: row.supplier,
    internalRef: row.internalRef,
    fileLocationUrl: row.fileLocationUrl,
    packagingDesignerName: row.packagingDesignerName,
    graphicDesignerName: row.graphicDesignerName,
    packagingEngineerName: row.packagingEngineerName,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function serializeArtwork(row: {
  id: string
  kind: string
  fileName: string
  storagePath: string
  mimeType: string | null
  byteSize: number | null
  pageCount: number | null
  aiCompatible: boolean | null
  extractedPlates: unknown
  extractedAt: Date | null
  createdAt: Date
}): Promise<PackagingArtworkDto> {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    storagePath: row.storagePath,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    pageCount: row.pageCount,
    aiCompatible: row.aiCompatible,
    extractedPlates: row.extractedPlates,
    extractedAt: iso(row.extractedAt),
    downloadUrl: await signedUrl(row.storagePath),
    createdAt: row.createdAt.toISOString(),
  }
}

/** Serialize a packet with its full component graph. */
export async function serializePacket(packet: PacketWithGraph): Promise<PacketDto> {
  const components: PacketComponentDto[] = await Promise.all(
    packet.components.map(async (component) => ({
      id: component.id,
      componentTypeId: component.componentTypeId,
      slug: component.componentType.slug,
      code: component.componentType.code,
      displayName: component.displayName,
      printed: component.componentType.printed,
      style: component.componentType.style,
      includeInCreativeIntent: component.includeInCreativeIntent,
      pageOrder: component.pageOrder,
      material: component.material,
      printingMethod: component.printingMethod,
      coatingMsdsRef: component.coatingMsdsRef,
      paperThickness: component.paperThickness,
      drawingPartNumber: component.drawingPartNumber,
      approvalStatus: component.approvalStatus,
      engineerNotes: component.engineerNotes,
      pdfPageTitle: component.pdfPageTitle,
      perProductNotes: component.perProductNotes,
      heightMm: component.heightMm,
      widthMm: component.widthMm,
      depthMm: component.depthMm,
      netWeightG: component.netWeightG,
      stickerPlacement: component.stickerPlacement,
      inks: stringArray(component.inks),
      finishes: stringArray(component.finishes),
      structuralPlates: stringArray(component.structuralPlates),
      printPartNumber: component.printPartNumber,
      platesSyncedAt: iso(component.platesSyncedAt),
      supplierPdfUrl: await signedUrl(component.supplierPdfPath),
      supplierPdfGeneratedAt: iso(component.supplierPdfGeneratedAt),
      supplierPdfError: component.supplierPdfError,
      artworks: await Promise.all(component.artworks.map(serializeArtwork)),
      packSteps: await Promise.all(
        component.packSteps.map(async (step) => ({
          id: step.id,
          stepNumber: step.stepNumber,
          instruction: step.instruction,
          imagePath: step.imagePath,
          imageFileName: step.imageFileName,
          imageUrl: await signedUrl(step.imagePath),
        }))
      ),
    }))
  )

  const overviewRow = packet.artworks.find((a) => a.kind === 'overview')

  return {
    id: packet.id,
    projectId: packet.projectId,
    stage: packet.stage,
    variant: packet.variant,
    skuCode: packet.skuCode,
    artworkDate: iso(packet.artworkDate),
    status: packet.status,
    creativeIntentPdfUrl: await signedUrl(packet.creativeIntentPdfPath),
    creativeIntentPdfGeneratedAt: iso(packet.creativeIntentPdfGeneratedAt),
    pdfError: packet.pdfError,
    lastExportedAt: iso(packet.lastExportedAt),
    updatedAt: packet.updatedAt.toISOString(),
    project: serializeProject(packet.project),
    components,
    overview: overviewRow ? await serializeArtwork(overviewRow) : null,
  }
}
