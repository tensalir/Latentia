---
name: loop-packaging-system
description: End-to-end automation for Loop's packaging production workflow, for any product (Aphrodite, Nyx, Apollo, Eclipse, Halo, future lines). Turns editable Illustrator (.ai) files plus a Creative Intent Excel workbook into supplier-ready PDFs with the 200×100 mm print box stamped on every page, syncs plate data (inks, finishes, dielines) from the .ai back into the workbook, embeds artwork previews, and builds the multi-page Creative Intent PDF. ALWAYS use whenever the user mentions Loop packaging, Creative Intent, supplier PDFs or printing briefs, print/info boxes on artwork, EVT/DVT/PVT/MP stages, plate names, ink/finish/dieline detection, cutter guides, packaging folder setup or migration, or uploads .ai files alongside packaging workbooks. Also trigger on phrases like "generate the supplier brief", "create the intent", "sync the workbook from the AI files", "stamp the print box", or "set up the EVT folder".
---

# Loop Packaging System

Loop ships physical products. Every SKU has a packaging set — rigid boxes, trays, inserts, guides, stickers, hangtags; the exact set varies by product — and every component moves through stages (EVT → DVT → PVT → MP) before reaching a print supplier. This skill automates the production handover at each stage: editable Illustrator files + a filled Excel workbook in, and out come supplier PDFs (print box stamped on every artwork page), a synced workbook, and the Creative Intent PDF the brand and supplier review together.

## Sources of truth (why the pipeline is shaped this way)

- **The Excel workbook** owns everything a human decides: Material, Printing Method, MSDS reference, Approval Status, which components are in the pack and their page order. One workbook per SKU (Black and Blue are two workbooks).
- **The Illustrator file** owns everything the artwork already knows: inks, special finishes, and structural dielines, encoded as plate names in the file's XMP metadata. These are *read, never retyped* — the sync step writes them into the workbook, so the two sources can't drift.
- **The folder structure + naming convention** is the contract that lets everything find everything. Scripts resolve files by *name* through recursive search from one path (`Artwork Folder` in Project Info). Set that one path; nothing else is a path.

## The canonical workflow (per SKU, per stage)

Copy this checklist and check items off as you go:

```
Packaging handover:
- [ ] 1. Folder structure exists (six subfolders in the stage folder)
- [ ] 2. Workbook built and human fields filled
- [ ] 3. Sync: sync_workbook.py (AI → Excel, rebuild tabs, PSD → PNG)
- [ ] 4. Supplier PDFs: generate_supplier_pdf.py per component
- [ ] 5. Previews: refresh_artwork_previews.py
- [ ] 6. Creative Intent: generate_creative_intent_pdf.py
```

### Step 1 — Folder structure

```
Loop Packaging/
└── {Product} {Type}/                  e.g. "Aphrodite Sleep Mask"
    ├── 00_Design/                     free-form, no rules
    ├── 01_Renders/                    presentation mockups, not for print
    └── 02_Production/                 the convention starts here
        └── {EVT|DVT|PVT|MP}/
            ├── Creative_Intent/       workbook + generated PDF, per colourway
            │   └── Reference_Images/  component mockup renders
            ├── Print_Files/           editable .ai + exported print PDF
            ├── Artwork_Assets/        overview render, product renders
            ├── Drawings/              cutter guides (510-XXXXXX series)
            ├── Production Documents/  packing, palletisation docs
            └── Archive/               old versions, prefixed YYYY-MM-DD_
```

When a product has several SKUs, nest per-colourway folders (`BLACK/`, `BLUE/`, …) inside `Creative_Intent/` and `Print_Files/` so SKUs never mix. Migrating a legacy folder? See `references/migration_guide.md`.

### Step 2 — Build the workbook

```bash
python scripts/build_template.py ".../Creative_Intent/{COLOUR}/{Product}_{Stage}_Creative_Intent_{Variant}.xlsx"
```

Then fill the human fields:

- **Project Info**: project name, Packaging Designer, Packaging Engineer, Graphic Designer, Supplier, date, stage, SKU/colourway. Set `Artwork Folder` to the stage root (the sync step also sets this). Set `Packaging Overview Image` to the overview render's file *name*.
- **Product Setup**: Include Yes/No per component + page order. Components listed here but without artwork yet are fine — they render as `[no artwork]` until their files arrive.
- **Component tabs**: Material, Printing Method, Coating MSDS Ref., Approval Status, and the artwork file names (names or globs, not paths — e.g. `Pulp_Tray_Mockup`, `Pulp_Tray*_ED*`). Leave Inks / Finishes / Print Part Number empty: the sync step fills them from the `.ai`.

Workbooks round-trip through Google Sheets constantly. If a user's workbook arrives with embedded preview images, Sheets may have mangled them — strip all floating images before import (keep data and dropdowns); previews re-embed in step 5. If component tabs went missing in the round-trip, step 3 rebuilds them.

### Step 3 — Sync (Illustrator → Excel)

```bash
python scripts/sync_workbook.py "<workbook.xlsx>" --stage-root ".../02_Production/EVT"
```

One command that makes the workbook match reality: sets the Artwork Folder, converts `.psd` renders to `.png` (the embedder can't read Photoshop files), rebuilds any tab that Product Setup includes but the workbook lost, retires the old "Special Effects" row from legacy workbooks, matches every `.ai` under `Print_Files/` to its component tab (longest tab-name prefix wins; `Rigid_Box_Lid__Black_…` → `Rigid_Box_Lid`), and writes Inks, Finishes, Print Part Number (= the `.ai` stem), and structural plates into each tab. Re-run any time the `.ai` files change.

### Step 4 — Supplier PDFs (the printing brief)

```bash
python scripts/generate_supplier_pdf.py \
  --workbook "<workbook.xlsx>" \
  --ai-file  ".../Print_Files/{COLOUR}/<component>.ai" \
  --component-tab <Tab_Name> \
  --out-dir  ".../Print_Files/{COLOUR}/supplier_out/"
```

Output is **one PDF per component**: the overlay, with the **200×100 mm print box stamped top-right on every page** (10 mm margin, sized per page's own MediaBox). The box shows Material / Method / MSDS / SKU Code from the workbook and the inks, special finishes, and structural plates read live from the `.ai`. Header carries Project/Part/Date on the left and Packaging Designer / Packaging Engineer / Graphic Designer on the right; dates render European (`DD-MM-YYYY`, no time). The artwork's content streams, spot colours, and layers are untouched — the box is an overlay.

Keep supplier outputs in a `supplier_out/` folder: the preview embedder deliberately ignores that folder (and any `*overlay*`/`*supplier*` names) so stamped PDFs never leak into Creative Intent artwork panels.

### Step 5 — Refresh previews

```bash
python scripts/refresh_artwork_previews.py "<workbook.xlsx>"
```

Resolves every artwork file name (exact, stem, or glob) recursively from the Artwork Folder and embeds thumbnails. Handles `.png/.jpg/.pdf/.ai` (AI/PDF pages are rasterised via `pdftoppm`). Missing files are reported, not fatal — a component awaiting artwork simply shows none yet.

### Step 6 — Creative Intent PDF

```bash
python scripts/generate_creative_intent_pdf.py "<workbook.xlsx>" ["<output.pdf>"]
```

Overview page (exploded render + component key, in Product Setup page order) then one spec page per included component: the filled specifications, the mockup, and the **clean** artwork — no print box here; that belongs only on supplier PDFs.

## Naming convention (component-first)

```
{Component}[__{Variant}]_{Ref}_{Product}_{Stage}_{DDMMYY}_{Type}.ext
```

The component leads and must match the workbook tab name exactly — that's what the sync step matches on. `{Variant}` (double underscore) only on SKU-specific files. `{Ref}` is the internal reference (e.g. `A120`) and `{DDMMYY}` the artwork cut date — both come from the artwork, never invented.

| Artifact | Example | Lives in |
|---|---|---|
| Editable/print artwork | `Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai` | `Print_Files/{COLOUR}/` |
| Print PDF (outline export) | `…same stem…_OL.pdf` | `Print_Files/{COLOUR}/` |
| Cutter guide | `Pulp_Tray_Cutter_Guide_A120_Aphrodite_EVT_160726.ai` | `Drawings/` |
| Component mockup | `Pulp_Tray_Mockup.png` | `Creative_Intent/Reference_Images/` |
| Overview render | `Aphrodite_Overview.png` (or `.psd`, auto-converted) | `Artwork_Assets/` |
| Workbook / CI PDF | `Aphrodite_EVT_Creative_Intent_Black.xlsx` / `.pdf` | `Creative_Intent/{COLOUR}/` |

No dates in production filenames (the stage folder is the version); dates only on `Archive/` files (`YYYY-MM-DD_` prefix). Full spec: `references/folder_naming_spec.md`.

## Plate-name vocabulary (how the .ai is read)

Plate names from the `.ai`'s XMP metadata are classified by keyword:

- **Structural plates** — name contains `CUT LINE`, `BEND LINE`, `DIELINE`, `DIE CUT`, `PERF`, `FOLD LINE`, `CREASE`, `GLUE AREA`, `GLUE ZONE`
- **Special finishes** — name contains `EMBOSS`, `DEBOSS`, `UV`, `FOIL`, `SPOT`, `VARNISH`, `LAMINATE`, `GLOSS`, `MATT`
- **Inks** — everything else (CMYK process plates, Pantones, named inks)

The chips on the print box show the literal swatch text, so swatches must be named exactly as they should read (`UV GLOSS`, `DIE CUT` — uppercase, with the space). AI files must be saved with **Create PDF Compatible File** ticked, and keep the top-right **210 × 110 mm** of every sheet clear so the box lands cleanly. Full setup: `references/illustrator_setup.md`.

## Dependencies

Python 3.10+ with `openpyxl`, `pikepdf`, `reportlab`, `Pillow` (pip), plus `pdftoppm` from poppler-utils. Ghostscript is **not** needed (the old outlined-fonts output was retired; only the overlay is produced).

```bash
pip install openpyxl pikepdf reportlab Pillow
# poppler: `brew install poppler` (macOS) / `apt-get install poppler-utils` (Debian)
```

## Reference files

- `references/folder_naming_spec.md` — full folder + naming spec (canonical)
- `references/illustrator_setup.md` — AI prep: swatches, layers, reserved zone, saving
- `references/migration_guide.md` — legacy-folder migration with `migrate_stage_folder.py`
- `references/workflow_walkthrough.md` — end-to-end worked example

## Things that bite (learned in production)

- **`.gsheet` files are pointers, not spreadsheets.** If a user "uploads the workbook" and it's a `.gsheet`, there is no data inside — ask for a real `.xlsx` via Google Sheets → File → Download → Microsoft Excel.
- **Match by tab name.** If an `.ai` won't sync, its filename prefix doesn't match any component tab. Fix the name or the tab; don't guess the mapping.
- **A component in Product Setup with no files is not an error.** It's a planned part; it renders `[no artwork]` and gets no supplier PDF until files arrive. Report it, don't remove it.
- **Never hand-fill Inks/Finishes/Print Part Number.** They come from the `.ai`; hand-typed values will be overwritten on the next sync (that's the point).
- **The print box appears only on supplier PDFs.** If it shows up in the Creative Intent, a stamped PDF leaked into artwork resolution — check supplier outputs are in `supplier_out/`.
