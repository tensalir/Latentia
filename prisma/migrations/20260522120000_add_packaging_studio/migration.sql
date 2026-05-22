-- Packaging Studio schema

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "packaging_access" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "packaging_engineer_role" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "packaging_projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "product_type" TEXT,
    "product_family" TEXT,
    "owner_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "packaging_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "packaging_projects_product_slug_key" ON "packaging_projects"("product_slug");
CREATE INDEX IF NOT EXISTS "packaging_projects_owner_id_idx" ON "packaging_projects"("owner_id");

CREATE TABLE IF NOT EXISTS "packaging_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "diagnostics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "packaging_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "packaging_imports_owner_id_created_at_idx" ON "packaging_imports"("owner_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "packaging_packets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "import_id" UUID,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'MP',
    "variant" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "project_info" JSONB,
    "artwork_folder" TEXT,
    "overview_image_name" TEXT,
    "creative_intent_pdf_url" TEXT,
    "creative_intent_pdf_path" TEXT,
    "pdf_error" TEXT,
    "document_draft" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "packaging_packets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "packaging_packets_project_id_stage_variant_key" ON "packaging_packets"("project_id", "stage", "variant");
CREATE INDEX IF NOT EXISTS "packaging_packets_owner_id_idx" ON "packaging_packets"("owner_id");
CREATE INDEX IF NOT EXISTS "packaging_packets_project_id_idx" ON "packaging_packets"("project_id");
CREATE INDEX IF NOT EXISTS "packaging_packets_status_idx" ON "packaging_packets"("status");

CREATE TABLE IF NOT EXISTS "packaging_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "packet_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'single_face',
    "page_order" INTEGER NOT NULL DEFAULT 0,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "packing_steps" JSONB NOT NULL DEFAULT '[]',
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "supplier_pdf_url" TEXT,
    "supplier_pdf_path" TEXT,
    "supplier_pdf_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "packaging_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "packaging_components_packet_id_slug_key" ON "packaging_components"("packet_id", "slug");
CREATE INDEX IF NOT EXISTS "packaging_components_packet_id_idx" ON "packaging_components"("packet_id");

CREATE TABLE IF NOT EXISTS "packaging_artworks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "component_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "caption" TEXT,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "byte_size" INTEGER,
    "extracted_plates" JSONB,
    "extracted_at" TIMESTAMP(3),
    "mismatched_material_ids" JSONB NOT NULL DEFAULT '[]',
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "packaging_artworks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "packaging_artworks_component_id_idx" ON "packaging_artworks"("component_id");

CREATE TABLE IF NOT EXISTS "packaging_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "approval_status" TEXT NOT NULL DEFAULT 'approved',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "packaging_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "packaging_materials_kind_code_key" ON "packaging_materials"("kind", "code");
CREATE INDEX IF NOT EXISTS "packaging_materials_kind_approval_status_idx" ON "packaging_materials"("kind", "approval_status");

CREATE TABLE IF NOT EXISTS "packaging_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "packet_id" UUID NOT NULL,
    "component_id" UUID,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "packaging_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "packaging_comments_packet_id_created_at_idx" ON "packaging_comments"("packet_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "packaging_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "packet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "packaging_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "packaging_activity_packet_id_created_at_idx" ON "packaging_activity"("packet_id", "created_at" DESC);

ALTER TABLE "packaging_projects" ADD CONSTRAINT "packaging_projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_imports" ADD CONSTRAINT "packaging_imports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_packets" ADD CONSTRAINT "packaging_packets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "packaging_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_packets" ADD CONSTRAINT "packaging_packets_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "packaging_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "packaging_packets" ADD CONSTRAINT "packaging_packets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_components" ADD CONSTRAINT "packaging_components_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "packaging_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_artworks" ADD CONSTRAINT "packaging_artworks_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "packaging_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_artworks" ADD CONSTRAINT "packaging_artworks_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_materials" ADD CONSTRAINT "packaging_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_materials" ADD CONSTRAINT "packaging_materials_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "packaging_materials" ADD CONSTRAINT "packaging_materials_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "packaging_comments" ADD CONSTRAINT "packaging_comments_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "packaging_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_comments" ADD CONSTRAINT "packaging_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_comments" ADD CONSTRAINT "packaging_comments_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "packaging_activity" ADD CONSTRAINT "packaging_activity_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "packaging_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packaging_activity" ADD CONSTRAINT "packaging_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
