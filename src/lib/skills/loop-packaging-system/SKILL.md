---
name: loop-packaging-system
description: End-to-end automation for Loop's packaging production workflow. Turns editable Illustrator (.ai) files plus an Excel workbook into supplier-ready PDFs with auto-generated info boxes, the wrap-around Creative Intent brief PDF, and an organised stage folder. ALWAYS use whenever the user mentions Loop packaging, Creative Intent documents, supplier PDFs, info boxes on artwork files, printing brief, EVT/DVT/PVT/MP stages, plate names from AI files, ink/finish detection, 510-XXXXXX drawings, packaging folder migration, or setting up files for any Loop product (Nyx, Aphrodite, Apollo, Eclipse, etc.). Also trigger when the user uploads .ai files alongside Excel workbooks, references the top-right 200×100 mm info box, or asks things like "generate the supplier brief", "migrate my MP folder", or "make the Creative Intent for the Black SKU".
---

# Loop Packaging System

Loop ships physical products. Every SKU has a packaging set — outer sleeve, inner tray, tissue paper, tissue sticker, closure sticker, sometimes more — and every component goes through stages (EVT → DVT → PVT → MP) before hitting a print supplier. This skill automates the production handover at each stage: take the designer's editable Illustrator files plus a filled Excel workbook, and out the other side come supplier-ready PDFs (with the info box stamped on top-right of each artwork sheet), a wrap-around Creative Intent brief PDF, and a clean folder of named files.

## When to use this skill

Use it whenever a packaging-production task is on the table:

- Generating the supplier brief or info-box overlay on an artwork sheet
- Producing the Creative Intent PDF (the deck the brand + supplier review together)
- Setting up the workbook for a new product or a new SKU/colourway
- Reading inks/finishes/dielines from a `.ai` file (Loop encodes those as plate names)
- Organising a stage folder (EVT/DVT/PVT/MP) to match the standard structure
- Migrating an old, messy MP folder into the new layout
- Promoting a folder from DVT → PVT → MP

If the user mentions any Loop packaging concept — even casually — open this skill first instead of writing one-off code.

## How the pieces fit together

```
Editable AI files  ──┐
                      ├──► Supplier PDF      (Print_Files/*_supplier.pdf)
Excel workbook    ──┴──► Creative Intent PDF (Creative_Intent/*.pdf)
                          (plus embedded artwork previews in the workbook)
```

- **Excel workbook** is the source of truth for *Material, Print Method, Drawing/Print part numbers, Approval status, Notes, packing instructions*. One workbook per SKU.
- **Illustrator file** is the source of truth for *Inks, Special Finishes, Dielines* — Loop encodes these as plate names (e.g. `Cyan`, `Magenta`, `Yellow`, `Black`, `PANTONE Black C`, `UV GLOSS`, `3D EMBOSS`, `CUT LINE`, `BEND LINE`). The scripts read those plate names directly from the file's XMP metadata. No retyping.
- **Folder structure** is the contract that lets everything find everything. The scripts walk the stage root recursively, so you only ever set ONE path in the workbook (`Artwork Folder`) and every script discovers the rest by name.

## Scripts at a glance

| Script | What it does | When to run |
|---|---|---|
| `scripts/build_template.py` | Generates the empty Excel template. | Starting a new product or replacing an old workbook. |
| `scripts/refresh_artwork_previews.py` | Walks the workbook, finds artwork files by name in the Artwork Folder, embeds thumbnail previews into the preview cells. | After filling artwork file names in the workbook. Re-run any time a file changes. |
| `scripts/generate_supplier_pdf.py` | Reads plate names from a `.ai`, reads spec data from the workbook, stamps the 200×100 mm info box on the top-right of every artwork page. Produces three options (A overlay / B outlined + brief page / C untouched + brief page). | For each component, after the editable AI is final. |
| `scripts/generate_creative_intent_pdf.py` | Reads the workbook and produces the multi-page wrap-around Creative Intent PDF (cover + one page per component + packing instructions). | After supplier PDFs and mockups exist, as the final deliverable for the SKU. |
| `scripts/migrate_stage_folder.py` | Takes a legacy stage folder (the old "MP files/" style with mixed contents and inconsistent names) and emits the new structure with renamed files. Dry-run by default. | One-shot, when adopting the new convention or when promoting to a new stage. |

All scripts accept `--help` and have descriptive docstrings at the top of the file.

## The canonical workflow (per SKU, per stage)

This is what to do when you sit down to take a product through a stage. Five steps.

### Step 1 — Set up the folder structure

If the product folder doesn't exist yet, create it:

```
Loop Packaging/
└── {Product} {Type}/                 e.g.  "Nyx Sleep Mask"
    ├── 00_Design/                    (free-form, no convention)
    ├── 01_Renders/                   (mockups for presentations)
    └── 02_Production/
        ├── EVT/
        ├── DVT/
        ├── PVT/
        └── MP/
```

Inside each stage folder, six standard subfolders:

```
DVT/
├── Creative_Intent/      one Excel + one PDF per SKU
├── Print_Files/          editable AI + outlined PDF + supplier PDF
├── Artwork_Assets/       PNG/JPG mockups, technical artwork faces
├── Drawings/             engineering drawings (510-XXXXXX series)
├── Reference/            packing instructions, palletization docs
└── Archive/              old versions, prefixed YYYY-MM-DD_
```

If you're migrating an existing legacy folder, jump to `references/migration_guide.md`.

### Step 2 — Build the workbook

```bash
python scripts/build_template.py "<Product> Sleep Mask/02_Production/<Stage>/Creative_Intent/<Product>_<Stage>_Creative_Intent_<Variant>.xlsx"
```

Then open the workbook and fill:

- **Project Info tab**: project name, designer, engineer, date, stage, SKU/colourway. Set `Artwork Folder` to the absolute path of the stage root. Set `Packaging Overview Image` to the file *name* (no extension needed) of the exploded render that lives somewhere under the stage root.
- **Product Setup tab**: tick "Include" Yes/No for each component and set the page order in the PDF.
- **Component tabs** (Outer_Sleeve, Inner_Tray, Tissue_Paper, Tissue_Sticker, Closure_Sticker, plus any extras): fill Material, Inks/Print, Finishes, Printing Method, Drawing/Print Part Numbers, Approval Status, Notes. Then fill the Artwork rows (file *names*, not paths) and the Packing Instructions rows.

### Step 3 — Generate the supplier PDFs

For each component, run:

```bash
python scripts/generate_supplier_pdf.py \
  --workbook ".../Creative_Intent/<Product>_<Stage>_Creative_Intent_<Variant>.xlsx" \
  --ai-file  ".../Print_Files/<Product>_<Stage>_<Component>[_<Variant>]_editable.ai" \
  --component-tab <Component> \
  --out-dir ".../Print_Files/"
```

This produces three PDFs per component: `_OPTION_A_overlay.pdf` (Ana's chosen format — info box on the artwork page), `_OPTION_B_outlined_with_brief.pdf` (fonts outlined via Ghostscript + separate brief page), `_OPTION_C_untouched_with_brief.pdf` (artwork untouched + separate brief page). Keep the one your printer prefers; in practice that's been Option A.

The script auto-extracts inks/finishes/dielines from the AI file's `PlateNames` metadata. Anything matching `EMBOSS / DEBOSS / UV / FOIL / SPOT / VARNISH / LAMINATE / GLOSS / MATT / MATTE` is classified as a special finish; anything matching `CUT LINE / BEND LINE / DIELINE / PERF / FOLD LINE / CREASE` is a structural plate; everything else is treated as an ink.

### Step 4 — Refresh artwork previews

```bash
python scripts/refresh_artwork_previews.py ".../Creative_Intent/<Product>_<Stage>_Creative_Intent_<Variant>.xlsx"
```

Walks the workbook, finds every artwork file name by recursive search through the Artwork Folder, embeds thumbnails into the workbook's preview cells. Re-run anytime a file name changes.

### Step 5 — Generate the Creative Intent PDF

```bash
python scripts/generate_creative_intent_pdf.py \
  ".../Creative_Intent/<Product>_<Stage>_Creative_Intent_<Variant>.xlsx" \
  ".../Creative_Intent/<Product>_<Stage>_Creative_Intent_<Variant>.pdf"
```

Multi-page wrap-around brief: cover page (Packaging Overview image + component list) + one page per included component + packing instructions where present.

## Naming convention (one-line rule)

```
{Product}_{Stage}_{Component}[_{Variant}]_{Type}.ext
```

| Token | Examples |
|---|---|
| `Product` | `Nyx`, `Aphrodite`, `Apollo` |
| `Stage` | `EVT`, `DVT`, `PVT`, `MP` |
| `Component` | `Outer_Sleeve`, `Inner_Tray`, `Tissue_Paper`, `Tissue_Sticker`, `Closure_Sticker`, `Hangtag`, `Insert_Card`, `Earplug_Case`, `Carry_Pouch`, `Polybag`, `Master_Carton` |
| `Variant` (only on SKU-specific components) | `Black`, `Blue`, `Plum`, `Sage`, `Teal`, `Lilac` (human-readable colour names) |
| `Type` | `editable`, `OL`, `supplier`, `mockup`, `front`, `back`, `overview`, `Creative_Intent` |

Concrete examples:

```
Nyx_MP_Outer_Sleeve_Black_editable.ai
Nyx_MP_Outer_Sleeve_Black_supplier.pdf
Nyx_MP_Outer_Sleeve_Black_mockup.png
Nyx_MP_Closure_Sticker_Black_editable.ai
Nyx_MP_Creative_Intent_Black.xlsx
Nyx_MP_overview.png
```

Variant token only appears on per-SKU components — typically just the Closure Sticker. Shared components (sleeve, tray, tissue) don't carry a variant in their name. See `references/folder_naming_spec.md` for the full spec.

## Illustrator file setup (read this once)

For the scripts to work, the editable `.ai` files need three things:

1. **Plate names that match Loop's vocabulary**. CMYK + Pantone references for inks; `CUT LINE` / `BEND LINE` for dielines; `UV GLOSS` / `3D EMBOSS` / `FOIL` / etc. for special finishes. The scripts read these straight from XMP metadata.
2. **Layer structure**: typically `ARTWORK`, `CUTTERGUIDE`, `INFO` — the INFO layer is where Ana used to draw the spec box by hand. With this skill it's no longer needed; the script stamps a fresh info box in the top-right.
3. **Reserved zone for the info box**: keep the top-right `210 × 110 mm` of every artwork sheet clear (no dieline elements, no key art) so the overlay lands cleanly.

Full Illustrator setup details: `references/illustrator_setup.md`.

## Migration

If you're starting from a legacy folder like `MP files/` with mixed contents (`Print Files - MP/`, `Packaging part Drawings - MP/`, loose packing instructions PDFs):

```bash
# Dry-run first — touches nothing, just shows the rename plan
python scripts/migrate_stage_folder.py \
  --source "/path/to/MP files" \
  --dest   "/path/to/Nyx Sleep Mask/02_Production/MP" \
  --product Nyx \
  --stage MP

# Apply once the plan looks right
python scripts/migrate_stage_folder.py ... --apply

# Optional: --move to delete originals after copy
```

Detailed walkthrough in `references/migration_guide.md`.

## Dependencies

The scripts use:

- Python 3.10+
- `openpyxl`, `pikepdf`, `reportlab`, `Pillow` (pip-installable)
- `pdftoppm` from poppler-utils (renders AI/PDF pages to PNG thumbnails)
- `ghostscript` (only for Option B's font outlining — optional)

A one-time install:

```bash
pip install openpyxl pikepdf reportlab Pillow
brew install poppler ghostscript   # macOS
```

## Reference files

- `references/folder_naming_spec.md` — the full folder + naming spec, the canonical document
- `references/illustrator_setup.md` — how to prepare AI files (plate names, layers, reserved zone)
- `references/migration_guide.md` — step-by-step legacy-folder migration
- `references/workflow_walkthrough.md` — end-to-end example using Nyx

## Things to remember

- **One workbook per SKU.** Black and Blue Nyx are two workbooks, two Creative Intent PDFs, but mostly the same set of artwork files (only the closure sticker differs).
- **Variant is human-readable.** `Black`, not `en-ec-blk-01`.
- **Dates don't live in production filenames.** Version state is implicit by being in EVT/DVT/PVT/MP. Old versions move to `Archive/` with a `YYYY-MM-DD_` prefix.
- **Don't modify the editable AI file.** The supplier PDF overlay adds a content layer above the existing streams; it does not touch your spot colours, overprint settings, layers, or dieline.
- **The Artwork Folder field is the only path you need to set.** Everything else is found by name through recursive search. Archive paths are deprioritised so a current file is always picked over a historical copy with the same name.
