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

/** `Project Info`: labels in column B, values in column C, hints in column D. */
export const PROJECT_INFO_FIELDS = [
  'Project Name',
  'Product Type',
  'Product Family',
  'SKU / Colourway',
  'Packaging Designer',
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
 * The nine specification rows, in order. MUST stay nine entries — see the file
 * header. "Special Effects" was retired from this list; the importer skips it
 * if a legacy workbook still carries it.
 */
export const SPEC_FIELDS = [
  'Drawing Part Number',
  'Print Part Number',
  'Material',
  'Inks / Print',
  'Finishes',
  'Printing Method',
  'Coating MSDS Ref.',
  'Approval Status',
  'Notes',
] as const

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
  /** Artwork block: section band, then a header row, then the slot rows. */
  artworkSectionRow: 10 + SPEC_FIELDS.length + 1, // 20
  get artworkHeaderRow() {
    return this.artworkSectionRow + 1 // 21
  },
  get artworkFirstRow() {
    return this.artworkHeaderRow + 1 // 22
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

/** Dimensions rows we round-trip that have a DB home. */
export const DIMENSION_PAPER_THICKNESS = 'Paper Thickness'

export const APPROVAL_STATES = ['Draft', 'In review', 'Approved', 'Blocked'] as const
export const PRINTING_METHODS = ['Offset', 'Flexo', 'Digital', 'Screen', 'N/A'] as const

/** Artwork slot labels, by component style. */
export const ARTWORK_SLOTS = {
  two_face: ['Mockup', 'Artwork_Front', 'Artwork_Back'],
  single_face: ['Mockup', 'Artwork'],
} as const
