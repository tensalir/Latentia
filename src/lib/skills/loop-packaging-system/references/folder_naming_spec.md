# Loop Packaging — Folder & File Naming Spec (canonical)

## Contents
- Why naming is load-bearing
- The product folder
- Inside a stage folder
- Per-colourway nesting
- File naming: golden rules
- The pattern, per artifact
- Shared vs SKU-specific components
- Archive rules

## Why naming is load-bearing

The pipeline resolves every file by *name* through recursive search from a single
root (`Artwork Folder` in the workbook's Project Info). No script stores full
paths. Name a file the agreed way and it slots in automatically; name it loosely
and previews come up blank, plates get missed, and the supplier brief lands wrong.
The component token in every artwork filename must match its workbook tab name
exactly — that is what the sync step matches on.

## The product folder

One folder per product. Three zones, from private to strict:

```
Loop Packaging/
└── {Product} {Type}/                 e.g. "Aphrodite Sleep Mask"
    ├── 00_Design/        ← designer workspace. No rules.
    ├── 01_Renders/       ← presentation mockups, not for print
    └── 02_Production/    ← shared + strict. The convention starts here.
        ├── EVT/
        ├── DVT/
        ├── PVT/
        └── MP/
```

`00_Design/` and `01_Renders/` have no enforced structure. The rules apply only
inside `02_Production/`. The four stages are the production milestones; each
gets its own folder, and promoting to the next stage means copying the folder
and updating its contents (version state is *implicit in the stage*, never in
filenames).

## Inside a stage folder

Every stage folder has the same six subfolders. Create all six at stage start:

```
EVT/
├── Creative_Intent/       one workbook + one generated PDF per colourway
│   └── Reference_Images/  component mockup renders for the Creative Intent
├── Print_Files/           editable .ai + its exported print PDF
├── Artwork_Assets/        overview render + product renders used on final prints
├── Drawings/              cutter guides + engineering drawings (510-XXXXXX)
├── Production Documents/  packing instructions, palletisation docs
└── Archive/               superseded versions, prefixed YYYY-MM-DD_
```

Generated supplier PDFs go in a `supplier_out/` folder inside
`Print_Files/{COLOUR}/`. The preview embedder deliberately ignores that folder
so stamped briefs never appear as Creative Intent artwork.

## Per-colourway nesting

When a product has several SKUs, give each its own subfolder inside
`Creative_Intent/` and `Print_Files/` so SKUs never mix:

```
Creative_Intent/
├── BLACK/          Aphrodite_EVT_Creative_Intent_Black.xlsx  (+ .pdf)
├── BLUE/           Aphrodite_EVT_Creative_Intent_Blue.xlsx   (+ .pdf)
└── HOLOGRAPHIC/    Aphrodite_EVT_Creative_Intent_Holographic.xlsx
```

One workbook per SKU. Shared component files are duplicated per colour folder.

## File naming: golden rules

- `snake_case` — words joined by underscores, no spaces.
- The component token must match the workbook tab name exactly
  (e.g. `Rigid_Box_Lid`).
- Colourway only on SKU-specific files, separated by a **double underscore**:
  `Rigid_Box_Lid__Black`.
- No dates in production filenames — the stage folder is the version. Dates
  belong only on `Archive/` files (`YYYY-MM-DD_` prefix).
- No noise words: no `final`, `v2`, `updated`, `copy`. Promote the file to the
  right stage folder instead.
- Variant names are human-readable (`Black`, `Sage`), never SKU codes.

## The pattern, per artifact

```
{Component}[__{Variant}]_{Ref}_{Product}_{Stage}_{DDMMYY}_{Type}.ext
```

`{Ref}` is the internal reference (e.g. `A120`); `{DDMMYY}` is the date the
artwork was cut. Both come from the artwork file itself — never invented.
`_ED` marks the editable master; `_OL` marks the outline (print) export.

### Packaging elements

| Artifact | Name pattern | Example | Folder |
|---|---|---|---|
| Editable / print artwork | `{Component}[__{Variant}]_{Ref}_{Product}_{Stage}_{DDMMYY}_ED.ai` | `Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai` | `Print_Files/{COLOUR}/` |
| Print PDF (export of the .ai) | `…same stem…_OL.pdf` | `Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_OL.pdf` | `Print_Files/{COLOUR}/` |
| Cutter guide / dieline | `{Component}_Cutter_Guide_{Ref}_{Product}_{Stage}_{DDMMYY}.ai` | `Pulp_Tray_Cutter_Guide_A120_Aphrodite_EVT_160726.ai` | `Drawings/` |
| Component mockup | `{Component}_Mockup.png` | `Pulp_Tray_Mockup.png` | `Creative_Intent/Reference_Images/` |
| Exploded overview render | `{Product}_Overview.png` (`.psd` accepted, auto-converted) | `Aphrodite_Overview.png` | `Artwork_Assets/` |
| Product renders | `{Product_element}_{colour}_render.png/psd` | `left_black_render.png` | `Artwork_Assets/` |

### Production documents

| Artifact | Name pattern | Example | Folder |
|---|---|---|---|
| Creative Intent workbook | `{Product}_{Stage}_Creative_Intent_{Variant}.xlsx` | `Aphrodite_EVT_Creative_Intent_Black.xlsx` | `Creative_Intent/{COLOUR}/` |
| Creative Intent PDF | `…same stem….pdf` | `Aphrodite_EVT_Creative_Intent_Black.pdf` | `Creative_Intent/{COLOUR}/` |
| Supplier brief (generated) | `…AI stem…_OPTION_A_overlay.pdf` | auto-named by the script | `Print_Files/{COLOUR}/supplier_out/` |

## Shared vs SKU-specific components

Components identical across colourways (trays, inserts, guides) are saved once
with no colourway token. Only parts that actually differ per SKU carry
`__{Variant}`. Shared files are duplicated into each colour folder so every
SKU's folder is self-contained.

## Archive rules

Anything superseded moves to `Archive/` in the same stage, gaining a
`YYYY-MM-DD_` prefix (the date it was retired). The resolver deprioritises
Archive paths, so a current file always wins over a historical copy with the
same name.

<details>
<summary>Legacy convention (pre-2026, deprecated)</summary>

Older folders use `{Product}_{Stage}_{Component}[_{Variant}]_{Type}.ext`
(product-first, e.g. `Nyx_MP_Outer_Sleeve_Black_editable.ai`) with a
`Reference/` subfolder instead of `Production Documents/`. Migrate with
`scripts/migrate_stage_folder.py`; do not create new files in this style.
</details>
