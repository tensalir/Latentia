import { z } from 'zod'
import type { ParsedPackagingWorkbook } from './xlsx'

export const packagingSpecsSchema = z.record(z.string())

export const artworkSlotSchema = z.object({
  artworkType: z.string(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
})

export const packingStepSchema = z.object({
  step: z.string().optional(),
  instruction: z.string(),
  fileName: z.string().optional(),
})

export const packagingComponentInputSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  style: z.enum(['two_face', 'single_face']),
  pageOrder: z.number(),
  included: z.boolean(),
  specs: packagingSpecsSchema,
  packingSteps: z.array(packingStepSchema).default([]),
  dimensions: z.record(z.string()).default({}),
  artworks: z.array(artworkSlotSchema).default([]),
})

export const packagingProjectInfoSchema = z.object({
  projectName: z.string().optional(),
  productType: z.string().optional(),
  productFamily: z.string().optional(),
  skuColourway: z.string().optional(),
  designer: z.string().optional(),
  engineer: z.string().optional(),
  brandManager: z.string().optional(),
  date: z.string().optional(),
  stage: z.string().optional(),
  supplier: z.string().optional(),
  internalRef: z.string().optional(),
  notes: z.string().optional(),
  artworkFolder: z.string().optional(),
  overviewImageName: z.string().optional(),
})

export type PackagingComponentInput = z.infer<typeof packagingComponentInputSchema>
export type PackagingProjectInfo = z.infer<typeof packagingProjectInfoSchema>

export interface NormalizedPackagingWorkbook {
  projectInfo: PackagingProjectInfo
  components: PackagingComponentInput[]
  diagnostics: string[]
}

export function normaliseParsedWorkbook(parsed: ParsedPackagingWorkbook): NormalizedPackagingWorkbook {
  const diagnostics: string[] = []
  if (parsed.missingSheets.length) {
    diagnostics.push(`Missing sheets: ${parsed.missingSheets.join(', ')}`)
  }

  const projectInfo = packagingProjectInfoSchema.parse({
    projectName: parsed.projectInfo['Project Name'],
    productType: parsed.projectInfo['Product Type'],
    productFamily: parsed.projectInfo['Product Family'],
    skuColourway: parsed.projectInfo['SKU / Colourway'],
    designer: parsed.projectInfo['Packaging Designer'],
    engineer: parsed.projectInfo['Packaging Engineer'],
    brandManager: parsed.projectInfo['Brand Manager'],
    date: parsed.projectInfo['Date'],
    stage: parsed.projectInfo['Project Stage'],
    supplier: parsed.projectInfo['Supplier'],
    internalRef: parsed.projectInfo['Internal Reference'],
    notes: parsed.projectInfo['Notes'],
    artworkFolder: parsed.projectInfo['Artwork Folder'],
    overviewImageName: parsed.projectInfo['Packaging Overview Image'],
  })

  const components = parsed.components.map((c) =>
    packagingComponentInputSchema.parse({
      slug: c.tabName,
      displayName: c.displayName,
      style: c.style,
      pageOrder: c.pageOrder,
      included: c.included,
      specs: c.specs,
      packingSteps: c.packingSteps,
      dimensions: c.dimensions,
      artworks: c.artworks,
    })
  )

  return { projectInfo, components, diagnostics }
}
