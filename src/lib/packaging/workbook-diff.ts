/**
 * Diff a parsed workbook against the packet in the database.
 *
 * Pure — no Prisma, no I/O — so the resolution rules can be tested directly.
 * The rules encode the user's round-trip decision:
 *
 *   human field    → the sheet wins   (that is what people edit)
 *   machine field  → the database wins (read from the .ai; "never hand-fill")
 *   missing tab    → nothing changes  (a Sheets round-trip lost it)
 *   unknown slug   → reported, not applied (the library owns what may exist)
 */

import type { ParsedComponent, ParsedWorkbook } from './workbook-import'

export type DiffAction =
  | 'apply'
  | 'unchanged'
  | 'machine-skip'
  | 'missing-tab-keep'
  | 'add-component'
  | 'unknown-component'

export interface FieldDiff {
  componentSlug: string | null
  field: string
  sheetValue: string | null
  dbValue: string | null
  action: DiffAction
  note?: string
}

export interface WorkbookDiff {
  project: FieldDiff[]
  packet: FieldDiff[]
  components: FieldDiff[]
  /** Slugs in Product Setup that this packet does not have a row for. */
  newComponentSlugs: string[]
  /** Slugs in Product Setup that are not in the components library at all. */
  unknownComponentSlugs: string[]
  /** Packet components absent from Product Setup — left alone, never deleted. */
  untouchedComponentSlugs: string[]
  counts: Record<DiffAction, number>
}

export interface DbComponentSnapshot {
  slug: string
  displayName: string
  includeInCreativeIntent: boolean
  pageOrder: number
  material: string | null
  printingMethod: string | null
  coatingMsdsRef: string | null
  paperThickness: string | null
  drawingPartNumber: string | null
  approvalStatus: string | null
  engineerNotes: string | null
  packStepCount: number
}

export interface DbSnapshot {
  projectName: string
  productType: string | null
  productFamily: string | null
  supplier: string | null
  internalRef: string | null
  packagingDesignerName: string | null
  packagingEngineerName: string | null
  graphicDesignerName: string | null
  fileLocationUrl: string | null
  notes: string | null
  stage: string
  variant: string
  skuCode: string | null
  artworkDate: Date | null
  components: DbComponentSnapshot[]
}

const HUMAN_COMPONENT_FIELDS: Array<[keyof ParsedComponent['human'], keyof DbComponentSnapshot, string]> = [
  ['material', 'material', 'Material'],
  ['printingMethod', 'printingMethod', 'Printing method'],
  ['coatingMsdsRef', 'coatingMsdsRef', 'Coating / MSDS'],
  ['paperThickness', 'paperThickness', 'Paper thickness'],
  ['drawingPartNumber', 'drawingPartNumber', 'Drawing part no.'],
  ['approvalStatus', 'approvalStatus', 'Approval status'],
  ['engineerNotes', 'engineerNotes', 'Notes'],
]

function norm(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

function push(list: FieldDiff[], diff: FieldDiff) {
  list.push(diff)
}

/**
 * Compare a sheet value against the database value. A blank sheet cell means
 * "not stated", NOT "clear this field" — clearing is done in the app, so a
 * round-trip through Sheets can never silently wipe data.
 */
function compareHuman(
  componentSlug: string | null,
  field: string,
  sheetValue: string | null,
  dbValue: string | null
): FieldDiff {
  const sheet = norm(sheetValue)
  const db = norm(dbValue)
  if (sheet === null) {
    return {
      componentSlug,
      field,
      sheetValue: null,
      dbValue: db,
      action: 'unchanged',
      note: db ? 'Blank in the sheet — kept the existing value.' : undefined,
    }
  }
  if (sheet === db) {
    return { componentSlug, field, sheetValue: sheet, dbValue: db, action: 'unchanged' }
  }
  return { componentSlug, field, sheetValue: sheet, dbValue: db, action: 'apply' }
}

export function diffWorkbook(args: {
  parsed: ParsedWorkbook
  db: DbSnapshot
  /** Slugs that exist in the components library. */
  librarySlugs: string[]
}): WorkbookDiff {
  const { parsed, db } = args
  const library = new Set(args.librarySlugs)
  const project: FieldDiff[] = []
  const packet: FieldDiff[] = []
  const components: FieldDiff[] = []

  // ── Project-level ────────────────────────────────────────────────────────
  const projectPairs: Array<[string, string | null, string | null]> = [
    ['Product type', parsed.projectInfo.productType, db.productType],
    ['Product family', parsed.projectInfo.productFamily, db.productFamily],
    ['Supplier', parsed.projectInfo.supplier, db.supplier],
    ['Internal reference', parsed.projectInfo.internalRef, db.internalRef],
    ['Packaging designer', parsed.projectInfo.packagingDesigner, db.packagingDesignerName],
    ['Packaging engineer', parsed.projectInfo.packagingEngineer, db.packagingEngineerName],
    ['Graphic designer', parsed.projectInfo.graphicDesigner, db.graphicDesignerName],
    ['Where the files live', parsed.projectInfo.artworkFolder, db.fileLocationUrl],
    ['Notes', parsed.projectInfo.notes, db.notes],
  ]
  for (const [field, sheetValue, dbValue] of projectPairs) {
    push(project, compareHuman(null, field, sheetValue, dbValue))
  }

  // ── Packet-level ─────────────────────────────────────────────────────────
  push(packet, compareHuman(null, 'SKU / colourway', parsed.projectInfo.skuColourway, db.skuCode))

  const sheetDate = parsed.projectInfo.date
  const dbDate = db.artworkDate
  const sameDate =
    (sheetDate?.toISOString().slice(0, 10) ?? null) === (dbDate?.toISOString().slice(0, 10) ?? null)
  push(packet, {
    componentSlug: null,
    field: 'Artwork date',
    sheetValue: sheetDate ? sheetDate.toISOString().slice(0, 10) : null,
    dbValue: dbDate ? dbDate.toISOString().slice(0, 10) : null,
    action: sheetDate === null ? 'unchanged' : sameDate ? 'unchanged' : 'apply',
  })

  // The stage is part of the packet's identity, not an editable field — a
  // changed value in the sheet means the wrong packet is being imported into.
  if (parsed.projectInfo.stage && parsed.projectInfo.stage !== db.stage) {
    push(packet, {
      componentSlug: null,
      field: 'Project stage',
      sheetValue: parsed.projectInfo.stage,
      dbValue: db.stage,
      action: 'unchanged',
      note: `This packet is ${db.stage}. Stage identifies the packet and cannot be changed by import.`,
    })
  }

  // ── Components ───────────────────────────────────────────────────────────
  const dbBySlug = new Map(db.components.map((c) => [c.slug, c]))
  const seen = new Set<string>()
  const newComponentSlugs: string[] = []
  const unknownComponentSlugs: string[] = []

  for (const parsedComponent of parsed.components) {
    seen.add(parsedComponent.slug)
    const existing = dbBySlug.get(parsedComponent.slug)

    if (!existing) {
      if (library.has(parsedComponent.slug)) {
        newComponentSlugs.push(parsedComponent.slug)
        push(components, {
          componentSlug: parsedComponent.slug,
          field: 'Component',
          sheetValue: parsedComponent.displayName,
          dbValue: null,
          action: 'add-component',
          note: 'In the sheet but not on this packet — will be added.',
        })
      } else {
        unknownComponentSlugs.push(parsedComponent.slug)
        push(components, {
          componentSlug: parsedComponent.slug,
          field: 'Component',
          sheetValue: parsedComponent.displayName,
          dbValue: null,
          action: 'unknown-component',
          note: 'Not in the components library — add it there first.',
        })
      }
      continue
    }

    if (parsedComponent.tabMissing) {
      push(components, {
        componentSlug: parsedComponent.slug,
        field: 'Specifications',
        sheetValue: null,
        dbValue: null,
        action: 'missing-tab-keep',
        note: 'Tab missing from the workbook — existing specs kept.',
      })
    } else {
      for (const [humanKey, dbKey, label] of HUMAN_COMPONENT_FIELDS) {
        push(
          components,
          compareHuman(
            parsedComponent.slug,
            label,
            parsedComponent.human[humanKey],
            existing[dbKey] as string | null
          )
        )
      }
      // Machine fields: reported so the editor learns why their edit vanished.
      for (const [field, value] of Object.entries(parsedComponent.machineFound)) {
        push(components, {
          componentSlug: parsedComponent.slug,
          field,
          sheetValue: value,
          dbValue: null,
          action: 'machine-skip',
          note: 'Read from the artwork file — the sheet value is ignored.',
        })
      }
      if (parsedComponent.packSteps.length > 0 || existing.packStepCount > 0) {
        const same = parsedComponent.packSteps.length === existing.packStepCount
        push(components, {
          componentSlug: parsedComponent.slug,
          field: 'Pack instructions',
          sheetValue: `${parsedComponent.packSteps.length} step(s)`,
          dbValue: `${existing.packStepCount} step(s)`,
          action: same && parsedComponent.packSteps.length === 0 ? 'unchanged' : 'apply',
        })
      }
    }

    const includeDiff = {
      componentSlug: parsedComponent.slug,
      field: 'In Creative Intent',
      sheetValue: parsedComponent.includeInCreativeIntent ? 'Yes' : 'No',
      dbValue: existing.includeInCreativeIntent ? 'Yes' : 'No',
      action:
        parsedComponent.includeInCreativeIntent === existing.includeInCreativeIntent
          ? ('unchanged' as const)
          : ('apply' as const),
    }
    push(components, includeDiff)

    if (parsedComponent.pageOrder !== 9999 && parsedComponent.pageOrder !== existing.pageOrder) {
      push(components, {
        componentSlug: parsedComponent.slug,
        field: 'Page order',
        sheetValue: String(parsedComponent.pageOrder),
        dbValue: String(existing.pageOrder),
        action: 'apply',
      })
    }
  }

  // Components on the packet but absent from the sheet are left alone. Import
  // never deletes: removing a component is an explicit action in the library.
  const untouchedComponentSlugs = db.components.filter((c) => !seen.has(c.slug)).map((c) => c.slug)

  const counts = [...project, ...packet, ...components].reduce<Record<DiffAction, number>>(
    (acc, diff) => {
      acc[diff.action] = (acc[diff.action] ?? 0) + 1
      return acc
    },
    {
      apply: 0,
      unchanged: 0,
      'machine-skip': 0,
      'missing-tab-keep': 0,
      'add-component': 0,
      'unknown-component': 0,
    }
  )

  return {
    project,
    packet,
    components,
    newComponentSlugs,
    unknownComponentSlugs,
    untouchedComponentSlugs,
    counts,
  }
}

/** Only the entries a reviewer needs to see — the noise is `unchanged`. */
export function actionableDiffs(diff: WorkbookDiff): FieldDiff[] {
  return [...diff.project, ...diff.packet, ...diff.components].filter(
    (d) => d.action !== 'unchanged'
  )
}
