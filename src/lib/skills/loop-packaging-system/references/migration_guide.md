# Migration guide — legacy MP folder → new structure

This guide is for the first time you take a product folder that's been
maintained in the old freeform style ("MP files/" with mixed contents,
inconsistent filenames, dates baked into names, etc.) and bring it onto
the new convention.

## What the script does

`scripts/migrate_stage_folder.py` walks your legacy folder, classifies
every file by name + extension + location, and produces a rename plan into
the new six-subfolder structure. It maps:

- "Outer Sleeve Packaging" → `Outer_Sleeve`
- "Inner Packaging" → `Inner_Tray` (renamed for consistency)
- "Tissue Paper Sticker" → `Tissue_Sticker`
- "Closure Sticker" → `Closure_Sticker`
- "Barcode closure label" → `Barcode_Closure_Label`
- Plus Circle Sticker, Master Carton, Logo Protective Film, Hangtag,
  Insert Card, Earplug Case, Carry Pouch, Polybag.

It extracts colourway variants (Black, Blue, Plum, Sage, Teal, Lilac,
White, Grey, Coral, Mint, Rose, Sand, Amber) when present, strips noise
tokens ("copy updates", "Final MP file", dates), and routes packing
instructions / palletization docs to the `Reference/` subfolder.

Engineering drawings keep their per-component subfolder and their original
filename so `510-XXXXXX` part numbers stay intact.

## Always start with a dry-run

```bash
python scripts/migrate_stage_folder.py \
  --source "/path/to/legacy/MP files" \
  --dest   "/path/to/Nyx Sleep Mask/02_Production/MP" \
  --product Nyx \
  --stage MP
```

Without `--apply` the script touches nothing. It prints a table:

```
STATUS  NEW PATH                                              ← OLD PATH
------  ----------------------------------------------------- ----------
OK      Drawings/Inner_Tray/Nyx_Inner_510-000003.pdf          ← Packaging part Drawings - MP/Inner tray/...
OK      Print_Files/Nyx_MP_Closure_Sticker_editable.ai        ← Print Files - MP/Nyx_Closure Sticker_copy updates_160426_editable.ai
OK      Reference/Nyx_MP_Packing_Instructions.pdf             ← Packing Instructions_Eclipse Sleep Mask Black and Plum_20122025.pdf
...
SKIP    no rule matched — review manually                     ← random_file.dat
```

Read the plan carefully. Anything `SKIP` needs you to either:

- Add a new mapping to the script (edit `COMPONENT_MAP` or `COLOURWAYS`
  at the top of `scripts/migrate_stage_folder.py`)
- Manually classify the file after the bulk migration

## Apply once you're happy with the plan

```bash
python scripts/migrate_stage_folder.py ... --apply
```

This **copies** files into the new structure. Your originals stay where
they are. A `migration_log.csv` is written to the destination listing every
move for the audit trail.

The empty standard subfolders (`Creative_Intent`, `Print_Files`,
`Artwork_Assets`, `Drawings`, `Reference`, `Archive`) are created
automatically even if no files land in them.

## Move instead of copy (only when you're confident)

```bash
python scripts/migrate_stage_folder.py ... --apply --move
```

Use this only after you've verified `--apply` worked correctly on a small
test first. Once moved, the legacy structure no longer exists.

## Recommended testing protocol

1. **Pick 2–3 representative files** from your real legacy folder. Copy
   them to a fresh empty folder, e.g. `~/Desktop/test_migration/MP files/`.
2. Run the migration script in dry-run mode against the test folder.
3. Verify the rename plan looks right.
4. Run with `--apply` against the test folder. Inspect the result.
5. Only then point the script at the real folder.

## Adding a new component to the mapping

If your portfolio uses a component the script doesn't know about (e.g. a
new `Wax_Seal` or `Ribbon`), edit `scripts/migrate_stage_folder.py`:

```python
COMPONENT_MAP: list[tuple[str, str]] = [
    ...
    ("wax seal",  "Wax_Seal"),
    ("ribbon",    "Ribbon"),
    ("sleeve",    "Outer_Sleeve"),  # generic — must stay last
]
```

Order matters — more specific phrases first, generic fallbacks last.

## Adding a new colourway

Edit the `COLOURWAYS` list in the same file:

```python
COLOURWAYS = [
    "Black", "Blue", "Plum", "Sage", "Teal", "Lilac", "White",
    "Grey", "Gray", "Coral", "Mint", "Rose", "Sand", "Amber",
    "Sunset",  # new
]
```

Capitalise each colour — the script matches them as standalone words.

## Tricky case: variants on shared components

The migration script names files without a variant token unless it sees a
colour in the source filename. For most components that's correct — sleeve,
tray, tissue paper are shared across SKUs.

But for the **Closure Sticker**, you typically have a Black version and a
Blue version with different artwork (each carrying a different colour band
on the tear strip). If your legacy file is named just
`Nyx_Closure Sticker_copy updates_160426_editable.ai` without "Black" in
it, the migration produces `Nyx_MP_Closure_Sticker_editable.ai` — also
without a variant.

After migration, manually rename closure-sticker files to add the variant:

```bash
mv "Nyx_MP_Closure_Sticker_editable.ai" "Nyx_MP_Closure_Sticker_Black_editable.ai"
```

## When to migrate

Once per legacy stage folder. Do it as part of "adopting the system" for
an existing product. Future stage folders (EVT → DVT → PVT → MP) should
start in the new layout from day one and won't need migration.
