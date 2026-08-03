/**
 * Database side of the workbook round trip: project a packet into export
 * input, snapshot it for diffing, resolve which packet an uploaded workbook
 * belongs to, and apply an approved diff.
 *
 * The pure rules live in `workbook-diff.ts`; this module only moves data.
 */

import { prisma } from '@/lib/prisma'
import { slugifyProjectName } from './catalogue'
import { PackagingNotFoundError, getPacketOrThrow } from './service'
import type { ExportComponent, ExportInput } from './workbook-export'
import type { ParsedWorkbook } from './workbook-import'
import { diffWorkbook, type DbSnapshot, type WorkbookDiff } from './workbook-diff'

type PacketGraph = Awaited<ReturnType<typeof getPacketOrThrow>>

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export async function buildExportInput(packet: PacketGraph): Promise<ExportInput> {
  const catalogue = await prisma.packagingComponentType.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    select: { code: true, slug: true, displayName: true, description: true, printed: true },
  })

  const components: ExportComponent[] = packet.components.map((component) => ({
    slug: component.componentType.slug,
    code: component.componentType.code,
    displayName: component.displayName,
    description: component.componentType.description,
    printed: component.componentType.printed,
    includeInCreativeIntent: component.includeInCreativeIntent,
    pageOrder: component.pageOrder,
    material: component.material,
    printingMethod: component.printingMethod,
    coatingMsdsRef: component.coatingMsdsRef,
    paperThickness: component.paperThickness,
    drawingPartNumber: component.drawingPartNumber,
    approvalStatus: component.approvalStatus,
    engineerNotes: component.engineerNotes,
    inks: stringArray(component.inks),
    finishes: stringArray(component.finishes),
    printPartNumber: component.printPartNumber,
    artworkFileName:
      component.artworks.filter((a) => a.kind === 'editable_ai').slice(-1)[0]?.fileName ?? null,
    mockupFileName:
      component.artworks.filter((a) => a.kind === 'mockup').slice(-1)[0]?.fileName ?? null,
    packSteps: component.packSteps.map((step) => ({
      stepNumber: step.stepNumber,
      instruction: step.instruction,
      imageFileName: step.imageFileName,
    })),
  }))

  return {
    projectName: packet.project.name,
    productType: packet.project.productType,
    productFamily: packet.project.productFamily,
    skuCode: packet.skuCode,
    variant: packet.variant,
    stage: packet.stage,
    supplier: packet.project.supplier,
    internalRef: packet.project.internalRef,
    packagingDesigner: packet.project.packagingDesignerName,
    packagingEngineer: packet.project.packagingEngineerName,
    graphicDesigner: packet.project.graphicDesignerName,
    artworkDate: packet.artworkDate,
    fileLocationUrl: packet.project.fileLocationUrl,
    overviewFileName: packet.artworks.find((a) => a.kind === 'overview')?.fileName ?? null,
    notes: packet.project.notes,
    components,
    catalogue,
  }
}

export function buildDbSnapshot(packet: PacketGraph): DbSnapshot {
  return {
    projectName: packet.project.name,
    productType: packet.project.productType,
    productFamily: packet.project.productFamily,
    supplier: packet.project.supplier,
    internalRef: packet.project.internalRef,
    packagingDesignerName: packet.project.packagingDesignerName,
    packagingEngineerName: packet.project.packagingEngineerName,
    graphicDesignerName: packet.project.graphicDesignerName,
    fileLocationUrl: packet.project.fileLocationUrl,
    notes: packet.project.notes,
    stage: packet.stage,
    variant: packet.variant,
    skuCode: packet.skuCode,
    artworkDate: packet.artworkDate,
    components: packet.components.map((component) => ({
      slug: component.componentType.slug,
      displayName: component.displayName,
      includeInCreativeIntent: component.includeInCreativeIntent,
      pageOrder: component.pageOrder,
      material: component.material,
      printingMethod: component.printingMethod,
      coatingMsdsRef: component.coatingMsdsRef,
      paperThickness: component.paperThickness,
      drawingPartNumber: component.drawingPartNumber,
      approvalStatus: component.approvalStatus,
      engineerNotes: component.engineerNotes,
      packStepCount: component.packSteps.length,
    })),
  }
}

export interface ResolvedTarget {
  packet: PacketGraph | null
  projectId: string | null
  /** What creating the target would produce, when `packet` is null. */
  wouldCreate: { projectName: string; stage: string; variant: string } | null
  note: string
}

/**
 * Which packet does this workbook belong to? Keyed on (project, stage,
 * SKU/colourway) so re-importing the same file updates rather than duplicates.
 */
export async function resolveWorkbookTarget(args: {
  parsed: ParsedWorkbook
  explicitPacketId?: string | null
}): Promise<ResolvedTarget> {
  if (args.explicitPacketId) {
    const packet = await getPacketOrThrow(args.explicitPacketId)
    return {
      packet,
      projectId: packet.projectId,
      wouldCreate: null,
      note: `Importing into ${packet.project.name} ${packet.stage} / ${packet.variant}.`,
    }
  }

  const info = args.parsed.projectInfo
  if (!info.projectName) {
    throw new PackagingNotFoundError(
      'The workbook has no Project Name, so there is no way to tell which packet it belongs to.'
    )
  }
  const stage = info.stage ?? 'EVT'
  const variant = info.skuColourway ?? 'Default'
  const slug = slugifyProjectName(info.projectName)

  const project = await prisma.packagingProject.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })
  if (!project) {
    return {
      packet: null,
      projectId: null,
      wouldCreate: { projectName: info.projectName, stage, variant },
      note: `No project called "${info.projectName}" yet — it will be created.`,
    }
  }

  const existing = await prisma.packagingPacket.findUnique({
    where: { projectId_stage_variant: { projectId: project.id, stage, variant } },
    select: { id: true },
  })
  if (!existing) {
    return {
      packet: null,
      projectId: project.id,
      wouldCreate: { projectName: project.name, stage, variant },
      note: `${project.name} has no ${stage} / ${variant} packet yet — it will be created.`,
    }
  }

  const packet = await getPacketOrThrow(existing.id)
  return {
    packet,
    projectId: project.id,
    wouldCreate: null,
    note: `Updating the existing ${packet.stage} / ${packet.variant} packet.`,
  }
}

export async function diffAgainstPacket(args: {
  parsed: ParsedWorkbook
  packet: PacketGraph
}): Promise<WorkbookDiff> {
  const library = await prisma.packagingComponentType.findMany({ select: { slug: true } })
  return diffWorkbook({
    parsed: args.parsed,
    db: buildDbSnapshot(args.packet),
    librarySlugs: library.map((l) => l.slug),
  })
}

export interface ApplyResult {
  packetId: string
  created: boolean
  appliedFields: number
  addedComponents: string[]
  skippedMachineFields: number
  keptMissingTabs: string[]
  unknownComponents: string[]
}

/**
 * Apply a workbook to a packet, creating the project/packet when needed.
 * Human fields win from the sheet; machine fields, missing tabs and absent
 * components are left untouched (see `workbook-diff.ts` for the rules).
 */
export async function applyWorkbook(args: {
  parsed: ParsedWorkbook
  packetId?: string | null
  ownerId: string
}): Promise<ApplyResult> {
  const target = await resolveWorkbookTarget({
    parsed: args.parsed,
    explicitPacketId: args.packetId ?? null,
  })
  const info = args.parsed.projectInfo

  let packetId = target.packet?.id ?? null
  let created = false

  if (!packetId) {
    const projectName = info.projectName!
    const slug = slugifyProjectName(projectName)
    const project = await prisma.packagingProject.upsert({
      where: { slug },
      create: {
        name: projectName,
        slug,
        productType: info.productType,
        productFamily: info.productFamily,
        supplier: info.supplier,
        internalRef: info.internalRef,
        fileLocationUrl: info.artworkFolder,
        packagingDesignerName: info.packagingDesigner,
        packagingEngineerName: info.packagingEngineer,
        graphicDesignerName: info.graphicDesigner,
        notes: info.notes,
        ownerId: args.ownerId,
      },
      update: {},
    })
    const packet = await prisma.packagingPacket.create({
      data: {
        projectId: project.id,
        stage: info.stage ?? 'EVT',
        variant: info.skuColourway ?? 'Default',
        skuCode: info.skuColourway,
        artworkDate: info.date,
        ownerId: args.ownerId,
      },
    })
    packetId = packet.id
    created = true
  }

  const packet = await getPacketOrThrow(packetId)
  const diff = await diffAgainstPacket({ parsed: args.parsed, packet })
  const library = await prisma.packagingComponentType.findMany({
    select: { id: true, slug: true, displayName: true, defaultInCreativeIntent: true },
  })
  const libraryBySlug = new Map(library.map((l) => [l.slug, l]))

  // Only write fields the diff marked `apply` — that keeps this function and
  // the preview the user approved in exact agreement.
  const applied = new Set(
    [...diff.project, ...diff.packet, ...diff.components]
      .filter((d) => d.action === 'apply')
      .map((d) => `${d.componentSlug ?? ''}::${d.field}`)
  )
  const wants = (componentSlug: string | null, field: string) =>
    applied.has(`${componentSlug ?? ''}::${field}`)

  await prisma.$transaction(async (tx) => {
    // Project fields
    const projectData: Record<string, unknown> = {}
    if (wants(null, 'Product type')) projectData.productType = info.productType
    if (wants(null, 'Product family')) projectData.productFamily = info.productFamily
    if (wants(null, 'Supplier')) projectData.supplier = info.supplier
    if (wants(null, 'Internal reference')) projectData.internalRef = info.internalRef
    if (wants(null, 'Packaging designer')) projectData.packagingDesignerName = info.packagingDesigner
    if (wants(null, 'Packaging engineer')) projectData.packagingEngineerName = info.packagingEngineer
    if (wants(null, 'Graphic designer')) projectData.graphicDesignerName = info.graphicDesigner
    if (wants(null, 'Where the files live')) projectData.fileLocationUrl = info.artworkFolder
    if (wants(null, 'Notes')) projectData.notes = info.notes
    if (Object.keys(projectData).length > 0) {
      await tx.packagingProject.update({ where: { id: packet.projectId }, data: projectData })
    }

    // Packet fields
    const packetData: Record<string, unknown> = {}
    if (wants(null, 'SKU / colourway')) packetData.skuCode = info.skuColourway
    if (wants(null, 'Artwork date')) packetData.artworkDate = info.date
    if (Object.keys(packetData).length > 0) {
      await tx.packagingPacket.update({ where: { id: packet.id }, data: packetData })
    }

    // Components
    const existingBySlug = new Map(packet.components.map((c) => [c.componentType.slug, c]))
    for (const parsedComponent of args.parsed.components) {
      const slug = parsedComponent.slug
      let componentId = existingBySlug.get(slug)?.id ?? null

      if (!componentId) {
        const type = libraryBySlug.get(slug)
        if (!type) continue // unknown to the library — reported, not created
        const createdRow = await tx.packagingPacketComponent.create({
          data: {
            packetId: packet.id,
            componentTypeId: type.id,
            displayName: parsedComponent.displayName || type.displayName,
            includeInCreativeIntent: parsedComponent.includeInCreativeIntent,
            pageOrder: parsedComponent.pageOrder === 9999 ? 0 : parsedComponent.pageOrder,
          },
        })
        componentId = createdRow.id
      }

      const data: Record<string, unknown> = {}
      if (!parsedComponent.tabMissing) {
        if (wants(slug, 'Material')) data.material = parsedComponent.human.material
        if (wants(slug, 'Printing method')) data.printingMethod = parsedComponent.human.printingMethod
        if (wants(slug, 'Coating / MSDS')) data.coatingMsdsRef = parsedComponent.human.coatingMsdsRef
        if (wants(slug, 'Paper thickness')) data.paperThickness = parsedComponent.human.paperThickness
        if (wants(slug, 'Drawing part no.'))
          data.drawingPartNumber = parsedComponent.human.drawingPartNumber
        if (wants(slug, 'Approval status') && parsedComponent.human.approvalStatus)
          data.approvalStatus = parsedComponent.human.approvalStatus
        if (wants(slug, 'Notes')) data.engineerNotes = parsedComponent.human.engineerNotes
      }
      if (wants(slug, 'In Creative Intent'))
        data.includeInCreativeIntent = parsedComponent.includeInCreativeIntent
      if (wants(slug, 'Page order')) data.pageOrder = parsedComponent.pageOrder

      if (Object.keys(data).length > 0) {
        await tx.packagingPacketComponent.update({ where: { id: componentId }, data })
      }

      // Pack steps are replace-all: the sheet's list is the list.
      if (!parsedComponent.tabMissing && wants(slug, 'Pack instructions')) {
        await tx.packagingPackInstructionStep.deleteMany({
          where: { packetComponentId: componentId },
        })
        if (parsedComponent.packSteps.length > 0) {
          await tx.packagingPackInstructionStep.createMany({
            data: parsedComponent.packSteps.map((step) => ({
              packetComponentId: componentId!,
              stepNumber: step.stepNumber,
              instruction: step.instruction,
              // The sheet carries a file NAME; the bytes are uploaded in-app,
              // so only re-attach a name we can't resolve to a path as null.
              imageFileName: step.imageFileName,
              imagePath: null,
            })),
          })
        }
      }
    }
  })

  return {
    packetId: packet.id,
    created,
    appliedFields: applied.size,
    addedComponents: diff.newComponentSlugs,
    skippedMachineFields: diff.counts['machine-skip'],
    keptMissingTabs: args.parsed.components.filter((c) => c.tabMissing).map((c) => c.slug),
    unknownComponents: diff.unknownComponentSlugs,
  }
}
