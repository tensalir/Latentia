# End-to-end walkthrough — Nyx Sleep Mask, Black SKU, MP stage

A worked example showing every script in sequence. Substitute your product
and stage as needed.

## What you start with

- Editable Illustrator files, one per component, named per the convention:
  ```
  Nyx_MP_Outer_Sleeve_Black_editable.ai
  Nyx_MP_Inner_Tray_editable.ai
  Nyx_MP_Tissue_Paper_editable.ai
  Nyx_MP_Tissue_Sticker_editable.ai
  Nyx_MP_Closure_Sticker_editable.ai
  ```
- Engineering drawings (`510-XXXXXX` series), packing instructions, palletization
  docs — anything you already have.

## What you end up with

```
Nyx Sleep Mask/02_Production/MP/
├── Creative_Intent/
│   ├── Nyx_MP_Creative_Intent_Black.xlsx      ← source of truth
│   └── Nyx_MP_Creative_Intent_Black.pdf       ← wrap-around supplier brief
├── Print_Files/
│   ├── Nyx_MP_Outer_Sleeve_Black_editable.ai  ← unchanged
│   ├── Nyx_MP_Outer_Sleeve_Black_supplier.pdf ← generated
│   ├── ... (10 files: 5 editable + 5 supplier)
├── Artwork_Assets/
│   ├── Nyx_MP_overview.png
│   ├── Nyx_MP_Outer_Sleeve_Black_mockup.png
│   ├── Nyx_MP_Outer_Sleeve_Black_front.png
│   └── ...
├── Drawings/
│   ├── Inner_Tray/Nyx_Inner_510-000003.pdf
│   └── ...
├── Reference/
│   ├── Nyx_MP_Packing_Instructions.pdf
│   └── Nyx_MP_Palletization.pdf
└── Archive/
```

## Step 0 — Folder skeleton

```bash
ROOT="/Users/ana/Loop Packaging/Nyx Sleep Mask/02_Production/MP"
mkdir -p "$ROOT"/{Creative_Intent,Print_Files,Artwork_Assets,Drawings,Reference,Archive}
```

Drop your editable AI files into `Print_Files/`.

## Step 1 — Build the workbook

```bash
python scripts/build_template.py \
  "$ROOT/Creative_Intent/Nyx_MP_Creative_Intent_Black.xlsx"
```

Open the workbook. Three tabs need attention before anything else:

**Project Info**

| Field | Value |
|---|---|
| Project Name | Nyx Packaging |
| Product Type | Sleep Mask |
| Product Family | Sleep |
| SKU / Colourway | Black |
| Packaging Designer | Ana Cuesta |
| Packaging Engineer | Carys Manson |
| Date | 12/05/2026 |
| Project Stage | MP |
| Artwork Folder | `/Users/ana/Loop Packaging/Nyx Sleep Mask/02_Production/MP` |
| Packaging Overview Image | `Nyx_MP_overview` |

**Product Setup** — tick Yes for Outer_Sleeve, Inner_Tray, Tissue_Paper,
Tissue_Sticker, Closure_Sticker. Page order 1–5.

**Each component tab** — fill the Specifications block, then the Artwork
file names (just the names, not paths), then the Packing Instructions where
they apply.

## Step 2 — Generate supplier PDFs (5 components)

```bash
for COMP in Outer_Sleeve Inner_Tray Tissue_Paper Tissue_Sticker Closure_Sticker; do
  # Compose AI filename (Outer_Sleeve and Closure_Sticker have the Black variant)
  if [[ "$COMP" == "Outer_Sleeve" || "$COMP" == "Closure_Sticker" ]]; then
    AI="$ROOT/Print_Files/Nyx_MP_${COMP}_Black_editable.ai"
  else
    AI="$ROOT/Print_Files/Nyx_MP_${COMP}_editable.ai"
  fi
  python scripts/generate_supplier_pdf.py \
    --workbook "$ROOT/Creative_Intent/Nyx_MP_Creative_Intent_Black.xlsx" \
    --ai-file "$AI" \
    --component-tab $COMP \
    --out-dir "$ROOT/Print_Files/"
done
```

Each component produces three PDFs in `Print_Files/`:

```
Nyx_MP_Outer_Sleeve_Black_OPTION_A_overlay.pdf            ← keep this one
Nyx_MP_Outer_Sleeve_Black_OPTION_B_outlined_with_brief.pdf
Nyx_MP_Outer_Sleeve_Black_OPTION_C_untouched_with_brief.pdf
```

Rename the Option A file to drop the `_OPTION_A_overlay` suffix:

```bash
cd "$ROOT/Print_Files/"
for f in *_OPTION_A_overlay.pdf; do
  mv "$f" "${f%_OPTION_A_overlay.pdf}_supplier.pdf"
done
rm *_OPTION_B_*.pdf *_OPTION_C_*.pdf
```

## Step 3 — Render mockup PNGs

If you don't yet have product mockups in `Artwork_Assets/`, you can render
each AI's first page as a temporary placeholder:

```bash
for AI in "$ROOT/Print_Files/"*_editable.ai; do
  base=$(basename "$AI" _editable.ai)
  pdftoppm -r 120 -png -f 1 -l 1 -singlefile \
    "$AI" "$ROOT/Artwork_Assets/${base}_mockup"
done
```

For the overview image, ideally you'd have a 3D exploded render of the
full packaging. For an early draft, copy the sleeve mockup as a stand-in:

```bash
cp "$ROOT/Artwork_Assets/Nyx_MP_Outer_Sleeve_Black_mockup.png" \
   "$ROOT/Artwork_Assets/Nyx_MP_overview.png"
```

## Step 4 — Refresh previews in the workbook

```bash
python scripts/refresh_artwork_previews.py \
  "$ROOT/Creative_Intent/Nyx_MP_Creative_Intent_Black.xlsx"
```

Output looks like:

```
Refreshing previews in: .../Nyx_MP_Creative_Intent_Black.xlsx
Artwork folder: .../02_Production/MP
Embedded: 11  Skipped: 0  Missing: 0
```

Open the workbook to verify thumbnails appear in the Preview cells.

## Step 5 — Generate the Creative Intent PDF

```bash
python scripts/generate_creative_intent_pdf.py \
  "$ROOT/Creative_Intent/Nyx_MP_Creative_Intent_Black.xlsx" \
  "$ROOT/Creative_Intent/Nyx_MP_Creative_Intent_Black.pdf"
```

You now have:

- 5 supplier PDFs in `Print_Files/` (one per component, with info box overlay)
- 1 Creative Intent PDF in `Creative_Intent/` (6 pages: cover + 5 components)
- The Excel workbook with embedded thumbnails alongside the PDF

## Repeat for the Blue SKU

```bash
cp "$ROOT/Creative_Intent/Nyx_MP_Creative_Intent_Black.xlsx" \
   "$ROOT/Creative_Intent/Nyx_MP_Creative_Intent_Blue.xlsx"
```

Open the Blue workbook, change `SKU / Colourway` from Black to Blue. The
closure sticker artwork file name changes to `Nyx_MP_Closure_Sticker_Blue_*`
(if the Blue SKU has its own closure design). Everything else stays the
same. Re-run steps 4 and 5 for the Blue workbook.

## What changes between stages

When promoting MP → next project's EVT, or DVT → PVT for the current
product: duplicate the entire stage folder, rename `MP/` to the new stage,
change every `_MP_` token in filenames to the new stage code, update the
`Project Stage` field in the workbook, re-run steps 4 and 5.

A renaming helper script can do the tokens in bulk — ask for it if you're
doing this often.
