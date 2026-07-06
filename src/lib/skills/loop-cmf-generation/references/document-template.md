# Document Template

Loop CMF documents have a recognisable shape: a top-of-page meta header (CMF number / Collection / Product name / Product code / EAN / Edit date / Drawn / Checked / Checked), one hero-render page per SKU with a vertical component spec list, and a single shared part-breakdown page (clown reference + colour legend + breakdown grid) that closes the packet. The template mirrors Damien's source CMF deck so an exported PDF can drop straight into Loop's existing approval workflow without re-authoring.

Page order (LOCK, per Damien's feedback 2026-07-06): all render/spec pages first — one per SKU, in packet order — then exactly one part-breakdown page at the end. The breakdown is never repeated per SKU, and there is no pack-overview page.

## Contents

- Page geometry
- Meta header
- Render page (one per SKU)
- Final page (Part breakdown, once per packet)
- Footer
- HTML preview vs. PDF export
- Editing posture (what is editable, what is not)
- Approval gating

## Page geometry

- Aspect ratio: A4 portrait. Width 595, height 842 (PDF coordinates).
- Margins: 36pt on all sides.
- Header height: 96pt (holds the 3×3 meta grid).
- Footer height: 44pt (holds packet notes and the `-- N of M --` page marker).

The PDF (`src/lib/cmf/pdf.ts`) implements these constants and exports them as `CMF_PDF_GEOMETRY` for any consumer that needs to mirror the layout. It also exports `planCmfPages()` — the pure page plan (render pages, then one breakdown per distinct product) that the builder and the tests share. The HTML preview is currently rendered at 16:9 (`CmfDocumentPreviewDialog.tsx`) so designers see roughly the same information density during draft; the PDF is the canonical surface for the designer-facing deliverable.

## Meta header

A 3×3 grid sits at the top of every page. Cells are LOCK; values change per SKU.

| Row 1 | Row 2 | Row 3 |
|-------|-------|-------|
| CMF number | Collection | Product name |
| Product code | EAN code | Edit date |
| Drawn | Checked | Checked |

Cell values are fitted to a single line (`fitHeaderValue`): shrink from 9pt down to 6.5pt, then ellipsis-truncate. Values must never wrap — the grid rows are ~25pt apart, and a wrapped "Product name · colourway" used to land on top of the Edit date value below it.

Right of the grid: page label ("CMF Page 1" / "Part Break Down") in the primary colour, plus a DRAFT badge when `documentDraft.isDraft` is true.

On the shared part-breakdown page the header is SKU-agnostic: Product name carries no colourway, and Product code / EAN show a value only when every SKU in the product group agrees on one (otherwise an em-dash).

## Render page (one per SKU)

- Section title: "Product render" (top-left, ink).
- Hero plate: full-width panel beneath the title, ~45% of inner height. Light grey backplate; the approved render is aspect-preserving fit inside.
- Component spec list: vertical stack below the hero plate. Each component has a labelled key/value block — Material, Finish, Colour, Artwork — that matches Damien's source template. The Colour row keeps the SKU's Pantone: per-colourway colour belongs here, on the SKU page.
- Placeholder copy when no approved render is bound: "Render not generated yet" (muted, centred).

## Final page (Part breakdown, once per packet)

Drawn once at the end of the packet — one per distinct product in the packet, which in practice is exactly one page. The page describes the product's parts, not a colourway, so it must carry no per-SKU colour data.

- Section title: "Part break down" (top-left, ink).
- Clown band (when a clown asset resolves): the clown label in mono, the clown image aspect-fit on a light grey backplate (left ~55%), and the 2-column colour legend on the right — a swatch chip (the clown region colour) next to each component label. The breakdown page is sourced from the product's first render that carries a clown (falling back to its first render), resolved with the same three-tier rule the renderer uses (explicit `clownAssetId` → exact variant → product fallback) via `resolveClownAssetForRender` in `src/lib/cmf/render.ts`.
- 2-column grid of cards below, one per component. Each card shows the component label (primary colour), a region swatch on the right **only when a clown legend anchors it** (never a workbook colour), and a key/value column with **Material, Finish, Technique — no Pantone row** (Damien: material and finishing references only, because the breakdown applies to all SKUs).
- Cards wrap to additional rows; cells stop drawing when the page footer would collide.

## Footer

- 1px hairline at the top of the footer band.
- Packet notes (when set) wrap inside the left two thirds, muted.
- Page marker `-- N of M --` on the right (mono), where M = SKU count + one breakdown page per distinct product.

## HTML preview vs. PDF export

The HTML preview is the source of truth for layout while a packet is in draft. The PDF generator consumes the same document model, so changes in the preview show up in the PDF without re-rendering attempts.

What this means in practice:

- Approving an attempt updates the hero render in the preview.
- Editing label / colourway / order / notes in the preview updates the preview immediately; the PDF picks it up on next export.
- Editing component data, Pantone, material, or finish is NOT done in the preview. Adjust the workbook upstream — the spec is contractual.

## Editing posture

| Editable in preview | Not editable in preview |
|---------------------|-------------------------|
| SKU ordering inside the packet | Component spec (material, finish, Pantone, technique) |
| Colourway label override | Components present (add / remove) |
| Packet notes / packet name | Approved render image (use approve flow instead) |
| Palette overrides (additional swatches beyond components) | Meta header layout / page geometry / page order |

The editable subset goes through a packet-level `documentDraft` object (see `src/lib/cmf/document.ts`). Workbook edits require re-import.

## Approval gating

Final PDF export is gated on every SKU having an approved render attempt.

- "Generate PDF" disabled until all SKUs have approvals.
- If `documentDraft` opts a SKU into "draft override" (showing a chosen attempt without approving), the export draws a DRAFT badge next to each page label and the filename gains a `_DRAFT` suffix. Use sparingly — most CMF reviews want clean approval-gated PDFs.
