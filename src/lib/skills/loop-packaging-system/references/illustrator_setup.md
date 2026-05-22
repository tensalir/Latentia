# Illustrator setup for Loop production files

The scripts in this skill read structural data straight out of your editable
`.ai` files. For that to work reliably, every Illustrator file needs three
things set up consistently. Once you've done this once for a template, all
your future products inherit it.

## 1. Plate names — the most important thing

The `generate_supplier_pdf.py` script reads the `xmpTPg:PlateNames` XMP
metadata that Illustrator writes into every export. It uses that list to
populate the "INKS & FINISHES" section of the info box, classifying each
plate into one of three buckets:

| Bucket | Detection rule (case-insensitive substring) | Examples |
|---|---|---|
| **Inks** | Anything not matched by the other two buckets | `Cyan`, `Magenta`, `Yellow`, `Black`, `PANTONE Black C`, `PANTONE 7652 C`, `PANTONE 651 C` |
| **Special finishes** | `EMBOSS`, `DEBOSS`, `UV`, `FOIL`, `SPOT`, `VARNISH`, `LAMINATE`, `GLOSS`, `MATT`, `MATTE` | `UV GLOSS`, `3D EMBOSS`, `SPOT VARNISH`, `HOT FOIL` |
| **Structural plates** (dielines) | `CUT LINE`, `BEND LINE`, `DIELINE`, `PERF`, `FOLD LINE`, `CREASE` | `CUT LINE`, `BEND LINE` |

### How to set plate names in Illustrator

Plate names come from your **swatches** — every spot colour you define
becomes a plate at export time. To control what shows up in the info box:

1. Open the Swatches panel (`Window → Swatches`).
2. Name spot colours exactly the way they should appear in the supplier
   brief. For instance, name a spot swatch `UV GLOSS` (uppercase, with a
   space) and that's the literal text the supplier will see on the chip.
3. CMYK process colours are added automatically by Illustrator if the
   document uses them — you don't need to name those.

### Worked examples from real Nyx files

```
Outer Sleeve Black:
  ['Black', 'CUT LINE', 'PANTONE Black C', 'UV GLOSS', '3D EMBOSS', 'BEND LINE']
  → Inks: 2 (Black, PANTONE Black C)
  → Special finishes: 2 (UV GLOSS, 3D EMBOSS)
  → Dielines: 2 (CUT LINE, BEND LINE)

Closure Sticker:
  ['Cyan', 'Magenta', 'Yellow', 'Black', 'PANTONE Black C',
   'PANTONE 7652 C', 'PANTONE 651 C', 'CUT LINE']
  → Inks: 7 (CMYK + 3 Pantones)
  → Special finishes: 0
  → Dielines: 1 (CUT LINE)
```

### Common mistakes

- **Lowercase or mixed-case plate names** still work, but the chip will
  show whatever case you used. For consistency in the supplier brief, use
  uppercase for finishes/dielines (`UV GLOSS`, `CUT LINE`).
- **Spelling variations** matter. `UVGLOSS` won't be classified as a finish
  because there's no space — it'd be treated as an ink. Use `UV GLOSS`.
- **Plates that exist in swatches but aren't used** still appear in the
  metadata. Delete unused spot swatches before exporting if you want a
  clean list.

## 2. Layer structure

Loop's convention is three layers:

```
ARTWORK       ← all printable content
CUTTERGUIDE   ← dielines (CUT LINE, BEND LINE plates live here)
INFO          ← (historical) where the spec box was drawn by hand
```

With this skill the `INFO` layer becomes optional — the script stamps a
fresh info box on the supplier PDF, so you no longer need to maintain the
spec block manually inside the file. You can either:

- **Delete the INFO layer contents** from the editable file so the artwork
  is clean, and let the script render the brief on top.
- **Keep the INFO layer empty but present** so editable templates stay
  consistent.

Either way works. The script never modifies your file — it adds an overlay
on top during PDF generation.

## 3. The reserved zone for the info box

The supplier-PDF info box is **200 mm wide × 100 mm tall** and is placed
in the top-right corner of every artwork sheet with a 10 mm margin from the
top and right edges. That gives a **210 × 110 mm reserved zone** in the
top-right that should be kept clear of:

- Dieline geometry (CUT LINE, BEND LINE)
- Key artwork elements
- Anything that would be embarrassing for the supplier to see covered

For Loop's standard sheet sizes the zone is small relative to the full
sheet:

| Sheet | Sheet size | Reserved zone as % |
|---|---|---|
| Outer Sleeve | 451 × 437 mm | 18% of width × 25% of height |
| Inner Tray | 451 × 623 mm | 18% × 18% |
| Closure Sticker | 211 × 234 mm | ~99% × 47% (tight!) |
| Tissue Sticker | 210 × 202 mm | ~100% × 54% (tight!) |

On A4-width sheets like the closure and tissue stickers the box spans
basically the full width — there's no usable real estate to the left of
the box in those cases. Plan the sticker layout knowing the top half of
the sheet will be eaten by the box.

If you ever need a smaller box, you can edit
`render_info_overlay_stamp()` in `scripts/generate_supplier_pdf.py` — look
for `BOX_W_MM` and `BOX_H_MM`. But changing them per-product breaks the
consistency promise to the supplier, so prefer keeping the box uniform and
adjusting your artwork instead.

## 4. Sheet sizes — recommendations

The script doesn't care about sheet size; it just stamps the box. But for
the info box to fit cleanly across the portfolio:

- **Minimum sheet width: 210 mm** (A4 portrait width). Anything narrower
  and the box will overflow.
- **Minimum sheet height: 250 mm** to leave usable space below the box.
- Anything bigger is fine — the box just sits in the corner and the rest
  of the sheet is yours.

## 5. Saving and exporting

When you save the editable AI:

- Use the file naming convention: `{Product}_{Stage}_{Component}[_{Variant}]_editable.ai`
- Save it to `02_Production/<Stage>/Print_Files/`
- Tick "Create PDF Compatible File" in Illustrator's save dialog (this is
  what lets the scripts read the file at all — `.ai` files without PDF
  compatibility cannot be opened by pikepdf).

When you export the outlined supplier version (only needed if your printer
specifically demands outlined fonts and won't accept embedded fonts):

- Open the editable file, `Type → Create Outlines` on all text.
- `File → Save As → Adobe PDF` with the `PDF/X-4` preset.
- Filename: `{Product}_{Stage}_{Component}[_{Variant}]_OL.pdf`.

The supplier PDF is then produced by the script on top of either the
editable AI (Option A — overlay) or the OL PDF (Option B — outlined +
brief page).

## 6. Quick checklist before running the supplier PDF generator

- [ ] All process inks (CMYK) used by the file appear in PlateNames
- [ ] All spot inks (Pantones) are named exactly as you want them on the brief
- [ ] All special finishes are named with the right keyword (`UV GLOSS`, `3D EMBOSS`, etc.)
- [ ] All structural plates are named with `CUT LINE` / `BEND LINE` / etc.
- [ ] The top-right 210 × 110 mm of the sheet is clear of artwork
- [ ] File saved with PDF compatibility (`Create PDF Compatible File` ticked)
- [ ] File named per the convention and placed in `Print_Files/`

If all six are true, the supplier PDF will land correctly the first time.
