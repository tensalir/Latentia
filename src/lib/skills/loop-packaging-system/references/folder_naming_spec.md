# Loop Packaging — Folder & Naming Convention

Single-source-of-truth structure that ties together the Creative Intent
template (Excel + generated PDF), the editable Illustrator files, the
supplier-ready exports, and reference documents.

The goal is for any person on the team — designer, engineer, brand,
supplier — to navigate to a product/stage folder and know where every
artifact is, and for the generator scripts to find every file by name
without hardcoded paths.

---

## 1. Top-level structure

One folder per product. Inside, three zones: exploratory (private),
mockup-only, and production (shared, organized).

```
Loop Packaging/
└── Nyx Sleep Mask/
    ├── 00_Design/             ← private, chaotic OK
    ├── 01_Renders/             ← presentation mockups, not for print
    └── 02_Production/          ← shared, strict structure
        ├── EVT/
        ├── DVT/
        ├── PVT/
        └── MP/
```

`00_Design/` and `01_Renders/` have **no enforced naming or substructure** —
they're the designer's workspace. The convention only kicks in inside
`02_Production/`.

---

## 2. Production stage folder (EVT / DVT / PVT / MP)

Every stage folder uses the same shape. Promoting from one stage to the
next means copying the folder and updating its contents.

```
DVT/
├── Creative_Intent/
│   ├── Nyx_DVT_Creative_Intent_Black.xlsx
│   ├── Nyx_DVT_Creative_Intent_Black.pdf
│   ├── Nyx_DVT_Creative_Intent_Blue.xlsx          (one workbook per SKU)
│   └── Nyx_DVT_Creative_Intent_Blue.pdf
├── Print_Files/
│   ├── Nyx_DVT_Outer_Sleeve_editable.ai
│   ├── Nyx_DVT_Outer_Sleeve_OL.pdf
│   ├── Nyx_DVT_Outer_Sleeve_supplier.pdf          (auto-generated from script)
│   ├── Nyx_DVT_Inner_Tray_editable.ai
│   ├── Nyx_DVT_Inner_Tray_OL.pdf
│   ├── Nyx_DVT_Inner_Tray_supplier.pdf
│   ├── Nyx_DVT_Tissue_Sticker_editable.ai
│   ├── …
│   ├── Nyx_DVT_Closure_Sticker_Black_editable.ai  (SKU-specific component)
│   ├── Nyx_DVT_Closure_Sticker_Black_OL.pdf
│   ├── Nyx_DVT_Closure_Sticker_Blue_editable.ai
│   └── Nyx_DVT_Closure_Sticker_Blue_OL.pdf
├── Artwork_Assets/
│   ├── Nyx_DVT_Outer_Sleeve_mockup.png
│   ├── Nyx_DVT_Outer_Sleeve_front.png
│   ├── Nyx_DVT_Outer_Sleeve_back.png
│   ├── Nyx_DVT_Inner_Tray_mockup.png
│   ├── Nyx_DVT_overview.png                       (exploded render for Page 1)
│   └── …
├── Drawings/
│   ├── Nyx_DVT_510-000004_Outer_Sleeve.pdf        (engineering drawings)
│   ├── Nyx_DVT_510-000003_Inner_Tray.pdf
│   ├── Nyx_DVT_510-000005_Tissue_Paper.pdf
│   └── …
├── Reference/
│   ├── Nyx_DVT_Packing_Instructions.pdf
│   ├── Nyx_DVT_Palletization.pdf
│   └── …
└── Archive/
    ├── 2026-04-15_Nyx_DVT_Outer_Sleeve_editable.ai
    └── …
```

### What each subfolder is for

| Subfolder         | Owns                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `Creative_Intent` | The Excel workbook + the generated Creative Intent PDF. **One per SKU.**   |
| `Print_Files`     | Editable AI, outlined PDF, and the supplier-ready PDF that bakes in the info box. |
| `Artwork_Assets`  | The PNG/JPG mockups + technical artwork referenced by the Creative Intent PDF. |
| `Drawings`        | Engineering / structural drawings (the `510-XXXXXX` series).               |
| `Reference`       | Loose docs — packing instructions, palletization, supplier specs.          |
| `Archive`         | Old versions of any of the above. Prefix with `YYYY-MM-DD_`.               |

---

## 3. File naming pattern

```
{Product}_{Stage}_{Component}[_{Variant}]_{Type}.{ext}
```

| Token       | Description                                                                                                | Examples                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `Product`   | Short product code. Matches the project folder name (PascalCase or single word).                            | `Nyx`, `Aphrodite`, `Apollo`                          |
| `Stage`     | Production stage.                                                                                          | `EVT`, `DVT`, `PVT`, `MP`                             |
| `Component` | Snake_case version of the component tab name in the Creative Intent workbook.                              | `Outer_Sleeve`, `Inner_Tray`, `Tissue_Sticker`, `Closure_Sticker`, `Master_Carton` |
| `Variant`   | **Only if the file is SKU-specific.** Closure stickers vary by colourway; outer sleeves usually don't.     | `Black`, `Blue`, `Plum`                               |
| `Type`      | Indicates what the file is. Pick one.                                                                      | `editable`, `OL`, `supplier`, `mockup`, `front`, `back`, `overview`, `Creative_Intent` |
| `ext`       | File extension.                                                                                            | `.ai`, `.pdf`, `.png`, `.xlsx`                        |

### Allowed `Type` values

| Type             | Where it lives        | Notes                                                                |
| ---------------- | --------------------- | -------------------------------------------------------------------- |
| `editable`       | `Print_Files/`        | Your live Illustrator file. Single source of truth for artwork.      |
| `OL`             | `Print_Files/`        | Outlined / supplier-pinned version saved out of Illustrator.         |
| `supplier`       | `Print_Files/`        | Auto-generated by `generate_supplier_pdf.py`: OL + info-box overlay. |
| `mockup`         | `Artwork_Assets/`     | Product render mockup for the Creative Intent PDF.                   |
| `front` / `back` | `Artwork_Assets/`     | Technical / dieline artwork faces.                                    |
| `overview`       | `Artwork_Assets/`     | The Packaging Overview Image (exploded render for Page 1).           |
| `Creative_Intent`| `Creative_Intent/`    | The workbook + generated PDF.                                        |

### Concrete examples

```
Nyx_DVT_Outer_Sleeve_editable.ai
Nyx_DVT_Outer_Sleeve_OL.pdf
Nyx_DVT_Outer_Sleeve_supplier.pdf
Nyx_DVT_Outer_Sleeve_mockup.png
Nyx_DVT_Outer_Sleeve_front.png
Nyx_DVT_Outer_Sleeve_back.png

Nyx_DVT_Closure_Sticker_Black_editable.ai     ← variant matters
Nyx_DVT_Closure_Sticker_Black_OL.pdf
Nyx_DVT_Closure_Sticker_Black_supplier.pdf
Nyx_DVT_Closure_Sticker_Blue_editable.ai

Nyx_DVT_Creative_Intent_Black.xlsx             ← one Excel per SKU
Nyx_DVT_Creative_Intent_Black.pdf
Nyx_DVT_Creative_Intent_Blue.xlsx
Nyx_DVT_Creative_Intent_Blue.pdf

Nyx_DVT_overview.png                           ← exploded render for Page 1
Nyx_DVT_510-000004_Outer_Sleeve.pdf            ← engineering drawing
```

### Rules of thumb

- **Snake_case throughout.** No spaces in production filenames. Spaces in folder names are fine for human use; files stay snake_case for tooling.
- **No dates in production filenames.** The version state is implicit by being inside `DVT/` vs `MP/`. Old versions move to `Archive/` with a `YYYY-MM-DD_` prefix.
- **Drop noise words.** "copy updates", "Final MP file", "updated" — all redundant. Promote the file to the right stage folder instead.
- **Variant token only when needed.** Most components (sleeve, tray, tissue) are shared across SKUs. The variant suffix only appears on per-SKU components (closure sticker, sometimes the printed inner tray).
- **Engineering drawings keep their part number.** `510-XXXXXX` is the canonical reference your supplier uses.

---

## 4. How this ties back to the Creative Intent template

In the Excel workbook's Project Info tab, you set:

| Field                       | Value                                                 |
| --------------------------- | ----------------------------------------------------- |
| `Artwork Folder`            | `…/Nyx Sleep Mask/02_Production/DVT/`                 |
| `Packaging Overview Image`  | `Nyx_DVT_overview`                                    |

Then on each component tab, the artwork rows reference just the file name:

| Artwork Type   | Caption                       | File Name                             |
| -------------- | ----------------------------- | ------------------------------------- |
| Mockup         | Sleeve mockup                 | `Nyx_DVT_Outer_Sleeve_mockup`         |
| Artwork_Front  | Front face dieline            | `Nyx_DVT_Outer_Sleeve_front`          |
| Artwork_Back   | (leave blank if not used)     |                                        |

The scripts walk the Artwork Folder (now recursively — see § 5) and find
each file in whichever subfolder it lives. You never paste a full path.

---

## 5. How files are resolved by the scripts

Both `refresh_artwork_previews.py` and `generate_creative_intent_pdf.py` /
`generate_supplier_pdf.py` resolve a file name in this order:

1. If the input is an absolute path, use it.
2. If it exists inside the workbook's folder, use that.
3. Recursively walk the `Artwork Folder` tree, looking for:
   - An exact match (`Nyx_DVT_Outer_Sleeve_mockup.png`)
   - A stem match (`Nyx_DVT_Outer_Sleeve_mockup` → `.png/.jpg/.pdf`)
   - A glob match (`Nyx_DVT_Outer_Sleeve_mockup*`)
4. First hit wins. If multiple matches exist (e.g. one in `Artwork_Assets`
   and one in `Archive`), the script prefers the shallower path.

This means you can set `Artwork Folder` to the **stage root**
(`…/DVT/`) and the script will find files anywhere underneath
(`Artwork_Assets/`, `Print_Files/`, `Drawings/`, etc.).

---

## 6. Promoting between stages

When moving from DVT → PVT, the steps are:

1. Duplicate the `DVT/` folder, rename to `PVT/`.
2. Update file name `Stage` token from `_DVT_` → `_PVT_` (a small renaming
   script can do this in one pass; ask and I'll write it).
3. In each Creative Intent workbook, update Project Info: `Project Stage`
   field to `PVT`, `Artwork Folder` path to the new `PVT/`.
4. Re-run `refresh_artwork_previews.py` and `generate_creative_intent_pdf.py`
   so the embedded previews and the generated PDFs point at the new files.
5. The previous stage's folder stays as a historical record.

---

## 7. Multi-SKU / multi-colourway

For Nyx (Black + Blue) the production folder holds:

- **One workbook per SKU** in `Creative_Intent/` (each generates its own PDF).
- **One copy** of components that are visually identical across SKUs (Outer
  Sleeve, Inner Tray, Tissue Sticker) — these have no variant in the name.
- **Per-SKU copies** of components that differ — typically just the Closure
  Sticker. These have the variant token (`_Black`, `_Blue`).

The Closure Sticker workbook entry on a Black-SKU workbook references
`Nyx_DVT_Closure_Sticker_Black_*`; the Blue workbook references
`Nyx_DVT_Closure_Sticker_Blue_*`. Everything else is shared.

---

## 8. Migration from the current MP structure

Your current `MP files/` folder is close to this spec. To migrate:

1. Make a new `02_Production/MP/` folder using the structure in § 2.
2. Move `Packaging part Drawings - MP/Sleeve/*` → `MP/Drawings/`, etc.
3. Move `Print Files - MP/*` into `MP/Print_Files/`. Rename to the new
   pattern (`Nyx_MP_Outer_Sleeve_editable.ai`, etc.).
4. Move the packing-instructions and palletization PDFs → `MP/Reference/`.
5. Move the old MP zip to `MP/Archive/` with a date prefix.
6. Drop a Creative Intent workbook into `MP/Creative_Intent/` and fill it
   in pointing at the new paths.

If you'd like a one-shot rename script that takes the current file list and
spits out the new names, say the word and I'll write it.

---

## TL;DR

- Three zones per product: `00_Design/`, `01_Renders/`, `02_Production/`.
- Inside `02_Production/`, one folder per stage (`EVT/DVT/PVT/MP`) with the
  same six subfolders: `Creative_Intent`, `Print_Files`, `Artwork_Assets`,
  `Drawings`, `Reference`, `Archive`.
- Filename pattern: `{Product}_{Stage}_{Component}[_{Variant}]_{Type}.ext`
- The Excel workbook just sets `Artwork Folder` to the stage root; the
  script walks downward to find every file by name.
