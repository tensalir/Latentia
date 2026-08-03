/**
 * Zod request schemas for Packaging Studio v2 routes.
 *
 * Machine fields (inks / finishes / structuralPlates / printPartNumber) are
 * deliberately absent from every mutable schema: they sync from the .ai and
 * are DB-authoritative ("never hand-fill" — loop-packaging-system SKILL.md).
 */

import { z } from 'zod'
import { PACKAGING_STAGES } from './naming'

const trimmed = (max: number) => z.string().trim().max(max)
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === '' ? null : v ?? null))

export const stageSchema = z.enum(PACKAGING_STAGES)

export const APPROVAL_STATUSES = ['Draft', 'In Review', 'Approved'] as const

// ── Catalogue ───────────────────────────────────────────────────────────────

export const componentTypeCreateSchema = z.object({
  code: optionalTrimmed(16),
  slug: trimmed(64).regex(/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/, {
    message: 'Slug must be Tab_Name_Form (letters/digits joined by single underscores)',
  }),
  displayName: trimmed(120).min(1),
  description: optionalTrimmed(2000),
  printed: z.boolean().optional().default(true),
  defaultInCreativeIntent: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
  active: z.boolean().optional().default(true),
})

export const componentTypePatchSchema = componentTypeCreateSchema.partial()

// ── Projects ────────────────────────────────────────────────────────────────

export const projectCreateSchema = z.object({
  name: trimmed(120).min(1),
  productType: optionalTrimmed(120),
  productFamily: optionalTrimmed(120),
  supplier: optionalTrimmed(200),
  internalRef: optionalTrimmed(32),
  fileLocationUrl: optionalTrimmed(2000),
  packagingDesignerName: optionalTrimmed(120),
  packagingDesignerId: z.string().uuid().nullish(),
  graphicDesignerName: optionalTrimmed(120),
  graphicDesignerId: z.string().uuid().nullish(),
  packagingEngineerName: optionalTrimmed(120),
  packagingEngineerId: z.string().uuid().nullish(),
  notes: optionalTrimmed(5000),
})

export const projectPatchSchema = projectCreateSchema.partial()

// ── Packets ─────────────────────────────────────────────────────────────────

export const packetCreateSchema = z.object({
  projectId: z.string().uuid(),
  stage: stageSchema,
  variant: trimmed(64).min(1).default('Default'),
  skuCode: optionalTrimmed(64),
})

export const packetPatchSchema = z.object({
  skuCode: optionalTrimmed(64),
  artworkDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use YYYY-MM-DD' })
    .nullish(),
  status: z.enum(['draft', 'generating', 'ready', 'failed']).optional(),
})

// ── Packet components ───────────────────────────────────────────────────────

export const componentsSyncSchema = z.object({
  componentTypeIds: z.array(z.string().uuid()).max(100),
  /** Delete deselected components even if they carry artwork/specs. */
  force: z.boolean().optional().default(false),
})

export const componentPatchSchema = z.object({
  displayName: trimmed(120).min(1).optional(),
  includeInCreativeIntent: z.boolean().optional(),
  pageOrder: z.number().int().min(0).max(10_000).optional(),
  material: optionalTrimmed(300),
  printingMethod: optionalTrimmed(300),
  coatingMsdsRef: optionalTrimmed(300),
  paperThickness: optionalTrimmed(120),
  drawingPartNumber: optionalTrimmed(120),
  approvalStatus: z.enum(APPROVAL_STATUSES).optional(),
  engineerNotes: optionalTrimmed(5000),
})

export const stepsPutSchema = z.object({
  steps: z
    .array(
      z.object({
        instruction: trimmed(2000).min(1),
        imagePath: optionalTrimmed(500),
        imageFileName: optionalTrimmed(200),
      })
    )
    .max(20),
})

// ── Artwork ─────────────────────────────────────────────────────────────────

export const ARTWORK_KINDS = ['editable_ai', 'mockup', 'overview', 'step_image'] as const

export const signedUploadRequestSchema = z.object({
  kind: z.enum(ARTWORK_KINDS),
  fileName: trimmed(200).min(1),
  packetComponentId: z.string().uuid().nullish(),
})

export const artworkRegisterSchema = z.object({
  kind: z.enum(['editable_ai', 'mockup', 'overview']),
  fileName: trimmed(200).min(1),
  storagePath: trimmed(500).min(1),
  mimeType: optionalTrimmed(120),
  byteSize: z.number().int().min(0).nullish(),
  packetComponentId: z.string().uuid().nullish(),
})

export type ComponentPatchInput = z.infer<typeof componentPatchSchema>
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>
export type PacketCreateInput = z.infer<typeof packetCreateSchema>

export function zodDetails(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}
