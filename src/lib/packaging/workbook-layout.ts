/**
 * The canonical Creative Intent workbook layout, shared by the exporter and
 * the importer so they can never drift apart.
 *
 * Ported from Anna's `build_template.py`. Row and column positions are load
 * bearing: her Python scripts address the artwork block at a FIXED offset
 * (`10 + len(SPEC_FIELDS) + 1`), so the specification list must stay exactly
 * nine rows. Anything extra we want to carry (paper thickness) goes in the
 * free-form Dimensions block instead of shifting everything below it.
 */

/** Sheet names, in workbook order. */
export const SHEETS = {
  readme: 'README',
  projectInfo: 'Project Info',
  componentsLibrary: 'Components Library',
  productSetup: 'Product Setup',
} as const

/**
 * `Project Info`: labels in column B, values in column C, hints in column D.
 * Labels match Anna's live workbook — note "Packaging Structural Designer",
 * which her build_template.py calls "Packaging Designer". The importer accepts
 * both (see PROJECT_INFO_ALIASES) so either vintage of the file reads.
 */
export const PROJECT_INFO_FIELDS = [
  'Project Name',
  'Product Type',
  'Product Family',
  'SKU / Colourway',
  'Packaging Structural Designer',
  'Packaging Engineer',
  'Graphic Designer',
  'Date',
  'Project Stage',
  'Supplier',
  'Internal Reference',
  'Artwork Folder',
  'Packaging Overview Image',
  'Notes',
] as const

/** Every label a given field has been known by, newest first. */
export const PROJECT_INFO_ALIASES: Record<string, string[]> = {
  'Packaging Structural Designer': ['Packaging Structural Designer', 'Packaging Designer'],
}

export const PROJECT_INFO_HEADER_ROW = 4
export const PROJECT_INFO_FIRST_ROW = 5
export const PROJECT_INFO_LABEL_COL = 2
export const PROJECT_INFO_VALUE_COL = 3
export const PROJECT_INFO_HINT_COL = 4

/** `Components Library` / `Product Setup`: header row 4, data from row 5. */
export const TABLE_HEADER_ROW = 4
export const TABLE_FIRST_ROW = 5

export const LIBRARY_HEADERS = [
  'Component ID',
  'Tab Name',
  'Display Name',
  'Description',
  'Style',
] as const

export const SETUP_HEADERS = [
  'Component ID',
  'Tab Name',
  'Display Name',
  'Include?',
  'Page Order',
  'Per-product notes',
] as const

/** Both tables start in column B. */
export const TABLE_FIRST_COL = 2

/**
 * The specification rows, in order — matching Anna's live workbook, which
 * still carries "Special Effects" between Finishes and Printing Method even
 * though her SKILL.md describes it as retired. We keep the row so a round trip
 * preserves her layout byte-for-byte in shape, but treat its VALUE as legacy:
 * special finishes come from the .ai, so the importer reports a typed value in
 * diagnostics rather than storing it.
 *
 * Changing the length of this list moves the artwork block (her Python
 * addresses it at 10 + len(SPEC_FIELDS) + 1), so add fields to the Dimensions
 * block instead.
 */
export const SPEC_FIELDS = [
  'Drawing Part Number',
  'Print Part Number',
  'Material',
  'Inks / Print',
  'Finishes',
  'Special Effects',
  'Printing Method',
  'Coating MSDS Ref.',
  'Approval Status',
  'Notes',
] as const

/** Present in the sheet, never written to the database. */
export const LEGACY_SPEC_FIELDS = ['Special Effects'] as const

/** Which spec rows are machine-owned: read from the .ai, never from the sheet. */
export const MACHINE_SPEC_FIELDS = ['Print Part Number', 'Inks / Print', 'Finishes'] as const

/** Component tab geometry (1-indexed rows; labels col A, values col B). */
export const COMPONENT_TAB = {
  displayNameRow: 4,
  descriptionRow: 5,
  pdfPageTitleRow: 6,
  specsHeaderRow: 9,
  specsFirstRow: 10,
  labelCol: 1,
  valueCol: 2,
  /** Artwork block: section band, then a header row, then the slot rows.
   *  With ten spec rows this lands on 21/22/23 — matching Anna's live file. */
  artworkSectionRow: 10 + SPEC_FIELDS.length + 1, // 21
  get artworkHeaderRow() {
    return this.artworkSectionRow + 1 // 22
  },
  get artworkFirstRow() {
    return this.artworkHeaderRow + 1 // 23
  },
  artworkHeaders: ['Artwork Type', 'Caption', 'File Name'] as const,
  packingHeaders: ['Step', 'Instruction', 'Image File Name'] as const,
  dimensionHeaders: ['Label', 'Value'] as const,
  /** Section titles the importer scans for — matched by prefix. */
  sections: {
    artwork: 'Artwork files',
    packing: 'Packing instructions',
    dimensions: 'Dimensions',
  },
} as const

/**
 * The Dimensions block, exactly as Anna's workbook lists it. Values are free
 * text on purpose — the sheet carries things like "≈12.5" and "120 x 80".
 *
 * `Paper Thickness` is NOT one of hers; it exists because the working session
 * called it out explicitly ("What thickness of paper?"), so it is appended
 * after her rows rather than mixed into them.
 */
export const DIMENSION_FIELDS = [
  { label: 'Height (mm)', field: 'heightMm' },
  { label: 'Width (mm)', field: 'widthMm' },
  { label: 'Depth (mm)', field: 'depthMm' },
  { label: 'Net weight (g)', field: 'netWeightG' },
  { label: 'Sticker / element placement', field: 'stickerPlacement' },
  { label: 'Paper Thickness', field: 'paperThickness' },
] as const

export type DimensionField = (typeof DIMENSION_FIELDS)[number]['field']

/** Artwork slot labels, by component style (Anna's ARTWORK_SLOTS). */
export const ARTWORK_SLOT_LABELS = {
  two_face: ['Mockup', 'Artwork_Front', 'Artwork_Back'],
  single_face: ['Mockup', 'Artwork'],
} as const

/** Component-header rows above the Specifications block. */
export const COMPONENT_HEADER_FIELDS = {
  displayName: 'Display Name',
  description: 'Description',
  pdfPageTitle: 'PDF Page Title',
} as const

export const APPROVAL_STATES = ['Draft', 'In review', 'Approved', 'Blocked'] as const
export const PRINTING_METHODS = ['Offset', 'Flexo', 'Digital', 'Screen', 'N/A'] as const
