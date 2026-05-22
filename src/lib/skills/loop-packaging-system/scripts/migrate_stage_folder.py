"""
Migrate an existing Loop packaging stage folder (EVT / DVT / PVT / MP) from the
legacy layout into the new structure defined in
Loop_Packaging_Folder_and_Naming_Spec.md.

Default behaviour is a DRY RUN — the script walks the source folder, decides
where every file would go, and prints a table of (old → new) without touching
anything on disk. Add --apply to actually copy (or --apply --move to move).

Usage
-----
    # Dry-run (recommended first):
    python migrate_stage_folder.py \\
        --source "/path/to/MP files" \\
        --dest   "/path/to/Nyx Sleep Mask/02_Production/MP" \\
        --product Nyx \\
        --stage   MP

    # Apply once you've reviewed the plan:
    python migrate_stage_folder.py ... --apply

    # If you want to MOVE rather than COPY (delete originals):
    python migrate_stage_folder.py ... --apply --move

The script writes a migration_log.csv in --dest alongside the moves so you
have an audit trail of every rename it performed.
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Component, variant, type recognisers
# ---------------------------------------------------------------------------

# Substring → target component. Order matters: more specific phrases first.
COMPONENT_MAP: list[tuple[str, str]] = [
    ("outer sleeve packaging", "Outer_Sleeve"),
    ("outer sleeve",            "Outer_Sleeve"),
    ("inner packaging",         "Inner_Tray"),
    ("inner tray",              "Inner_Tray"),
    ("tissue paper sticker",    "Tissue_Sticker"),
    ("tissue paper",            "Tissue_Paper"),
    ("closure sticker",         "Closure_Sticker"),
    ("barcode closure label",   "Barcode_Closure_Label"),
    ("barcode closure",         "Barcode_Closure_Label"),
    ("circle sticker",          "Circle_Sticker"),
    ("master carton",           "Master_Carton"),
    ("logo protective film",    "Logo_Protective_Film"),
    ("hangtag",                 "Hangtag"),
    ("insert card",             "Insert_Card"),
    ("earplug case",            "Earplug_Case"),
    ("carry pouch",             "Carry_Pouch"),
    ("polybag",                 "Polybag"),
    # Generic — keep last so it doesn't match "outer sleeve" first
    ("sleeve",                  "Outer_Sleeve"),
]

# Loop's known colourway palette. Add as the portfolio grows.
COLOURWAYS = [
    "Black", "Blue", "Plum", "Sage", "Teal", "Lilac", "White", "Grey", "Gray",
    "Coral", "Mint", "Rose", "Sand", "Amber",
]

# Tokens we strip from any reconstructed filename (in addition to date matches).
NOISE_TOKENS = [
    "copy updates", "copy_updates",
    "final mp file", "final_mp_file",
    "updated size pkg", "updated_size_pkg",
    "updated",
]

# DD-MM-YY / DD-MM-YYYY date stamps embedded in filenames (e.g. "_150426_", "_19122025_")
DATE_RE = re.compile(r"\b\d{6,8}\b")


def detect_component(name: str) -> str | None:
    n = name.lower()
    for needle, target in COMPONENT_MAP:
        if needle in n:
            return target
    return None


def detect_variant(name: str) -> str | None:
    for c in COLOURWAYS:
        if re.search(rf"(?:^|[\s_]){re.escape(c)}(?:[\s_]|$|\.)", name, re.I):
            return c
    return None


def detect_type(name: str) -> str | None:
    n = name.lower()
    if "_editable" in n or " editable" in n.replace("editable", " editable"):
        return "editable"
    if re.search(r"(?:^|[\s_])ol(?=[\s_.]|$)", n, re.I):
        return "OL"
    if "outlines" in n:
        return "OL"
    if "supplier" in n:
        return "supplier"
    if "mockup" in n:
        return "mockup"
    if "front" in n:
        return "front"
    if "back" in n:
        return "back"
    if "overview" in n:
        return "overview"
    return None


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

@dataclass
class Plan:
    src: Path
    dest: Path | None
    note: str = ""

    @property
    def status(self) -> str:
        return "OK" if self.dest else "SKIP"


REFERENCE_PATTERNS = [
    ("packing instructions", "Packing_Instructions"),
    ("palletization",        "Palletization"),
    ("specs",                "Supplier_Specs"),
]


def is_under_drawings(src: Path, source_root: Path) -> bool:
    """True if the file lives under a 'Packaging part Drawings' subtree."""
    rel = src.relative_to(source_root)
    return any("packaging part drawings" in p.lower() for p in rel.parts)


def classify(src: Path, source_root: Path, *, product: str, stage: str) -> Plan:
    """Decide where the file should land and what it should be called."""
    name = src.name
    stem = src.stem
    ext = src.suffix.lower()

    # 1) Engineering drawings — preserve the per-component subfolder structure
    if is_under_drawings(src, source_root):
        rel = src.relative_to(source_root)
        # First path component is "Packaging part Drawings - MP" (variable).
        # Map the remaining path into Drawings/<snake_case>/<original-filename>
        parts = list(rel.parts[1:])  # drop the top folder
        if not parts:
            return Plan(src, None, "drawing root file (no subfolder)")
        # Title_Snake_Case the subfolder name(s) (e.g. "Inner tray" → "Inner_Tray")
        def _titlecase_snake(s: str) -> str:
            cleaned = (s.replace("(", " ").replace(")", " ")
                        .replace("-", " "))
            words = [w for w in re.split(r"[\s_]+", cleaned) if w]
            # Drop low-signal words like "supplier" inside parentheticals.
            return "_".join(w.capitalize() for w in words)
        renamed_parts = [_titlecase_snake(p) for p in parts[:-1]]
        # Final filename stays as-is so engineering drawing numbers are preserved
        renamed_parts.append(parts[-1])
        return Plan(src, Path("Drawings") / Path(*renamed_parts), "engineering drawing")

    # 2) Reference docs (packing instructions, palletization)
    lower = name.lower()
    for needle, label in REFERENCE_PATTERNS:
        if needle in lower:
            new_name = f"{product}_{stage}_{label}{ext}"
            return Plan(src, Path("Reference") / new_name, f"reference doc ({label})")

    # 3) Zip handovers → Archive
    if ext == ".zip":
        # Preserve original name but prefix with stage / date if obvious
        return Plan(src, Path("Archive") / name, "zip archive")

    # 4) Print files (editable / OL / supplier)
    component = detect_component(name)
    variant = detect_variant(name)
    typ = detect_type(name)

    # Anything explicitly inside an Archive/ folder stays archived
    if any("archive" in p.lower() for p in src.relative_to(source_root).parts[:-1]):
        return Plan(src, Path("Archive") / name, "kept in Archive/")

    if component and typ and ext in {".ai", ".pdf"}:
        bits = [product, stage, component]
        if variant:
            bits.append(variant)
        bits.append(typ)
        new_name = "_".join(bits) + ext
        return Plan(src, Path("Print_Files") / new_name,
                    f"print file ({component}"
                    + (f", {variant}" if variant else "") + f", {typ})")

    # 5) Print files with no detectable type — still classify by component
    if component and ext in {".ai", ".pdf"}:
        bits = [product, stage, component]
        if variant:
            bits.append(variant)
        new_name = "_".join(bits) + ext
        return Plan(src, Path("Print_Files") / new_name,
                    f"print file ({component} — type not detected, please verify)")

    # 6) Image assets → Artwork_Assets
    if ext in {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}:
        if component:
            bits = [product, stage, component]
            if variant:
                bits.append(variant)
            if typ in {"mockup", "front", "back", "overview"}:
                bits.append(typ)
            new_name = "_".join(bits) + ext
            return Plan(src, Path("Artwork_Assets") / new_name,
                        f"artwork asset ({component})")
        return Plan(src, Path("Artwork_Assets") / name,
                    "image — keeping original name, please verify")

    # 7) Anything else → manual review queue
    return Plan(src, None, "no rule matched — review manually")


# ---------------------------------------------------------------------------
# Reporting & execution
# ---------------------------------------------------------------------------

def print_plan(plans: list[Plan], source_root: Path, dest_root: Path):
    print(f"\n{'STATUS':<6}  {'NEW PATH':<70}  ← OLD PATH")
    print("-" * 130)
    for p in plans:
        old = p.src.relative_to(source_root)
        if p.dest:
            new = str(p.dest)
            print(f"{p.status:<6}  {new:<70}  ← {old}")
        else:
            print(f"{'SKIP':<6}  {p.note:<70}  ← {old}")
    print()
    n_ok = sum(1 for p in plans if p.dest)
    n_skip = sum(1 for p in plans if not p.dest)
    print(f"Plan: {n_ok} file(s) ready, {n_skip} need manual review.")


def execute(plans: list[Plan], source_root: Path, dest_root: Path, *,
            move: bool = False, force: bool = False) -> list[tuple[str, str, str]]:
    log = []
    for p in plans:
        if not p.dest:
            log.append(("SKIP", str(p.src), p.note))
            continue
        target = dest_root / p.dest
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and not force:
            log.append(("EXISTS", str(p.src), str(target)))
            continue
        if move:
            shutil.move(str(p.src), str(target))
            action = "MOVE"
        else:
            shutil.copy2(str(p.src), str(target))
            action = "COPY"
        log.append((action, str(p.src), str(target)))
    return log


def write_log(log: list[tuple[str, str, str]], dest_root: Path):
    log_path = dest_root / "migration_log.csv"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["action", "source", "destination"])
        w.writerows(log)
    print(f"Migration log: {log_path}")


# ---------------------------------------------------------------------------
def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", type=Path, required=True,
                   help="Path to the legacy stage folder (e.g. 'MP files').")
    p.add_argument("--dest", type=Path, required=True,
                   help="Path where the new stage folder should be created.")
    p.add_argument("--product", type=str, required=True,
                   help="Product code (e.g. Nyx, Aphrodite).")
    p.add_argument("--stage", type=str, required=True,
                   choices=["EVT", "DVT", "PVT", "MP"],
                   help="Production stage.")
    p.add_argument("--apply", action="store_true",
                   help="Actually perform the moves (default is dry-run).")
    p.add_argument("--move", action="store_true",
                   help="Move files instead of copying. Use with --apply.")
    p.add_argument("--force", action="store_true",
                   help="Overwrite existing files at destination.")
    args = p.parse_args(argv)

    if not args.source.is_dir():
        sys.exit(f"Source folder not found: {args.source}")

    sources = sorted([f for f in args.source.rglob("*") if f.is_file()
                      and "migration_log.csv" not in f.name])
    if not sources:
        sys.exit("No files found in source folder.")

    plans = [classify(s, args.source, product=args.product, stage=args.stage)
             for s in sources]

    print(f"\nMigrating {len(sources)} file(s)")
    print(f"  source : {args.source}")
    print(f"  dest   : {args.dest}")
    print(f"  product: {args.product}    stage: {args.stage}")
    print_plan(plans, args.source, args.dest)

    if not args.apply:
        print("Dry-run only. Re-run with --apply to execute.")
        return

    log = execute(plans, args.source, args.dest, move=args.move, force=args.force)
    # Ensure standard empty subfolders exist for predictability
    for sub in ("Creative_Intent", "Print_Files", "Artwork_Assets",
                "Drawings", "Reference", "Archive"):
        (args.dest / sub).mkdir(parents=True, exist_ok=True)
    write_log(log, args.dest)
    print(f"Done. {sum(1 for a, *_ in log if a in ('COPY', 'MOVE'))} file(s) "
          f"{('moved' if args.move else 'copied')} to {args.dest}.")


if __name__ == "__main__":
    main()
