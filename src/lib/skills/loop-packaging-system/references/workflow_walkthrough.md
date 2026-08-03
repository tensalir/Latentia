# End-to-end walkthrough — Aphrodite EVT, Black SKU

A worked example of the six-step workflow. Product: Aphrodite Sleep Mask,
stage EVT, colourway Black, nine components (eight with artwork, one — the
Closure Sticker — planned but files not ready yet).

## Starting state

The designer hands over a stage folder:

```
EVT/
├── Creative_Intent/
│   ├── BLACK/
│   │   └── Aphrodite_EVT_Creative_Intent_Black.xlsx   ← human fields filled
│   └── Reference_Images/
│       ├── Rigid_Box_Lid_Mockup.png
│       ├── Pulp_Tray_Mockup.png
│       └── … one per component
├── Print_Files/
│   └── BLACK/
│       ├── Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai
│       ├── Pulp_Tray_Black_A120_Aphrodite_EVT_160726_ED.ai
│       ├── Hangtag_Black_A120_Aphrodite_EVT_160726_ED.ai
│       └── … eight editable AIs
├── Artwork_Assets/
│   └── Aphrodite_Overview.psd          ← Photoshop; sync converts it
├── Drawings/
│   └── Rigid_Box_Lid_Cutter_Guide_A120_Aphrodite_EVT_160726.ai …
├── Production Documents/
└── Archive/
```

In the workbook, Product Setup includes all nine components with page order
1–9. The Rigid Box Lid tab has Material `450gr Simwhite Paper`, Method
`Offset`, MSDS `Water Based Coating` — but Inks, Finishes and Print Part
Number are empty. That is correct: they come from the `.ai`.

## Step 3 — Sync

```bash
python scripts/sync_workbook.py \
  "EVT/Creative_Intent/BLACK/Aphrodite_EVT_Creative_Intent_Black.xlsx" \
  --stage-root "EVT"
```

Output tells the story:

```
converted PSD -> Aphrodite_Overview.png
rebuilt missing tab: Hangtag (single_face)        ← lost in a Sheets round-trip
  Rigid_Box_Lid                inks=6 finishes=1 dielines=2
  Hangtag                      inks=0 finishes=0 dielines=3
  …
no artwork yet (will render as [no artwork]): Closure_Sticker
```

Note the Hangtag: its plates are `DIE CUT`, `GLUE AREA`, `CREASE` — all
structural, zero inks. If those showed up under inks, the plate vocabulary is
out of date. The Rigid Box Lid picked up six inks (CMYK + Warm Black 2 +
PANTONE 10101 C), one finish (`holographic foil`), two dielines, and
`Print Part Number = Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED`.

## Step 4 — Supplier PDFs

Once per component that has an `.ai`:

```bash
python scripts/generate_supplier_pdf.py \
  --workbook "EVT/Creative_Intent/BLACK/Aphrodite_EVT_Creative_Intent_Black.xlsx" \
  --ai-file  "EVT/Print_Files/BLACK/Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai" \
  --component-tab Rigid_Box_Lid \
  --out-dir  "EVT/Print_Files/BLACK/supplier_out/"
```

One PDF out: `…_OPTION_A_overlay.pdf`, same page count as the source, the
200×100 mm box top-right on **every** page. Check the box: Material/Method/
MSDS/SKU from the workbook on the left; ink, finish and structural-plate chips
from the `.ai` on the right; header shows the three designers and the date as
`19-06-2026`.

## Step 5 — Previews

```bash
python scripts/refresh_artwork_previews.py \
  "EVT/Creative_Intent/BLACK/Aphrodite_EVT_Creative_Intent_Black.xlsx"
```

```
Embedded: 17  Skipped: 2  Missing: 2
  [missing] Closure_Sticker: Closure_Sticker_Mockup
  [missing] Closure_Sticker: Closure_Sticker*_ED*
```

Only the fileless component is missing — expected. The artwork panels resolve
to the clean `.ai` files, never to anything in `supplier_out/`.

## Step 6 — Creative Intent

```bash
python scripts/generate_creative_intent_pdf.py \
  "EVT/Creative_Intent/BLACK/Aphrodite_EVT_Creative_Intent_Black.xlsx" \
  "EVT/Creative_Intent/BLACK/Aphrodite_EVT_Creative_Intent_Black.pdf"
```

Ten pages: overview (exploded render + nine-component key in page order) then
one spec page per component. Rigid Box Lid's page shows the synced inks and
finish; Closure Sticker's shows `[no artwork]` placeholders. No print box
anywhere in this document.

## Repeat per SKU

Blue and Holographic are the same six steps with their own workbook and their
own `Print_Files/{COLOUR}/` folder. Only SKU-specific components (here, files
carrying `__Blue` / `__Holographic`) differ; shared files are duplicated into
each colour folder.
