-- Fields from Anna's real Creative Intent workbook that v2 didn't model:
-- component style (two_face needs front+back artwork), the Dimensions block,
-- the per-component PDF page title, and Product Setup's per-product notes.
-- All additive and nullable, so existing rows are untouched.

ALTER TABLE "packaging_component_types"
  ADD COLUMN IF NOT EXISTS "style" TEXT NOT NULL DEFAULT 'single_face';

ALTER TABLE "packaging_packet_components"
  ADD COLUMN IF NOT EXISTS "pdf_page_title" TEXT,
  ADD COLUMN IF NOT EXISTS "per_product_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "height_mm" TEXT,
  ADD COLUMN IF NOT EXISTS "width_mm" TEXT,
  ADD COLUMN IF NOT EXISTS "depth_mm" TEXT,
  ADD COLUMN IF NOT EXISTS "net_weight_g" TEXT,
  ADD COLUMN IF NOT EXISTS "sticker_placement" TEXT;
