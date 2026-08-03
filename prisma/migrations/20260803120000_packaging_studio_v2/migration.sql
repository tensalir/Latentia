-- Packaging Studio v2: database-first rebuild (drops v1 tables — approved destructive)

-- Drop v1 (dependents first)
DROP TABLE IF EXISTS "packaging_comments" CASCADE;
DROP TABLE IF EXISTS "packaging_activity" CASCADE;
DROP TABLE IF EXISTS "packaging_artworks" CASCADE;
DROP TABLE IF EXISTS "packaging_components" CASCADE;
DROP TABLE IF EXISTS "packaging_materials" CASCADE;
DROP TABLE IF EXISTS "packaging_packets" CASCADE;
DROP TABLE IF EXISTS "packaging_imports" CASCADE;
DROP TABLE IF EXISTS "packaging_projects" CASCADE;

-- CreateTable
CREATE TABLE "packaging_component_types" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "printed" BOOLEAN NOT NULL DEFAULT true,
    "default_in_creative_intent" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_component_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "product_type" TEXT,
    "product_family" TEXT,
    "supplier" TEXT,
    "internal_ref" TEXT,
    "file_location_url" TEXT,
    "packaging_designer_name" TEXT,
    "packaging_designer_id" UUID,
    "graphic_designer_name" TEXT,
    "graphic_designer_id" UUID,
    "packaging_engineer_name" TEXT,
    "packaging_engineer_id" UUID,
    "notes" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_packets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'EVT',
    "variant" TEXT NOT NULL DEFAULT 'Default',
    "sku_code" TEXT,
    "artwork_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "overview_artwork_id" UUID,
    "creative_intent_pdf_path" TEXT,
    "creative_intent_pdf_url" TEXT,
    "creative_intent_pdf_generated_at" TIMESTAMP(3),
    "pdf_error" TEXT,
    "last_import_id" UUID,
    "last_exported_at" TIMESTAMP(3),
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_packets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_packet_components" (
    "id" UUID NOT NULL,
    "packet_id" UUID NOT NULL,
    "component_type_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "include_in_creative_intent" BOOLEAN NOT NULL DEFAULT true,
    "page_order" INTEGER NOT NULL DEFAULT 0,
    "material" TEXT,
    "printing_method" TEXT,
    "coating_msds_ref" TEXT,
    "paper_thickness" TEXT,
    "drawing_part_number" TEXT,
    "approval_status" TEXT NOT NULL DEFAULT 'Draft',
    "engineer_notes" TEXT,
    "inks" JSONB NOT NULL DEFAULT '[]',
    "finishes" JSONB NOT NULL DEFAULT '[]',
    "structural_plates" JSONB NOT NULL DEFAULT '[]',
    "print_part_number" TEXT,
    "plates_synced_at" TIMESTAMP(3),
    "supplier_pdf_path" TEXT,
    "supplier_pdf_url" TEXT,
    "supplier_pdf_generated_at" TIMESTAMP(3),
    "supplier_pdf_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_packet_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_pack_instruction_steps" (
    "id" UUID NOT NULL,
    "packet_component_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "image_path" TEXT,
    "image_file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_pack_instruction_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_artworks" (
    "id" UUID NOT NULL,
    "packet_id" UUID NOT NULL,
    "packet_component_id" UUID,
    "kind" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "byte_size" INTEGER,
    "page_count" INTEGER,
    "ai_compatible" BOOLEAN,
    "extracted_plates" JSONB,
    "extracted_at" TIMESTAMP(3),
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_artworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_imports" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL DEFAULT 'create',
    "packet_id" UUID,
    "diagnostics" JSONB,
    "diff_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packaging_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_activity" (
    "id" UUID NOT NULL,
    "packet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packaging_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packaging_component_types_code_key" ON "packaging_component_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_component_types_slug_key" ON "packaging_component_types"("slug");

-- CreateIndex
CREATE INDEX "packaging_component_types_active_sort_order_idx" ON "packaging_component_types"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_projects_slug_key" ON "packaging_projects"("slug");

-- CreateIndex
CREATE INDEX "packaging_projects_owner_id_idx" ON "packaging_projects"("owner_id");

-- CreateIndex
CREATE INDEX "packaging_packets_project_id_idx" ON "packaging_packets"("project_id");

-- CreateIndex
CREATE INDEX "packaging_packets_owner_id_idx" ON "packaging_packets"("owner_id");

-- CreateIndex
CREATE INDEX "packaging_packets_status_idx" ON "packaging_packets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_packets_project_id_stage_variant_key" ON "packaging_packets"("project_id", "stage", "variant");

-- CreateIndex
CREATE INDEX "packaging_packet_components_packet_id_idx" ON "packaging_packet_components"("packet_id");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_packet_components_packet_id_component_type_id_key" ON "packaging_packet_components"("packet_id", "component_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_pack_instruction_steps_packet_component_id_step_n_key" ON "packaging_pack_instruction_steps"("packet_component_id", "step_number");

-- CreateIndex
CREATE INDEX "packaging_artworks_packet_id_idx" ON "packaging_artworks"("packet_id");

-- CreateIndex
CREATE INDEX "packaging_artworks_packet_component_id_idx" ON "packaging_artworks"("packet_component_id");

-- CreateIndex
CREATE INDEX "packaging_imports_owner_id_created_at_idx" ON "packaging_imports"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "packaging_activity_packet_id_created_at_idx" ON "packaging_activity"("packet_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "packaging_projects" ADD CONSTRAINT "packaging_projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_packets" ADD CONSTRAINT "packaging_packets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "packaging_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_packets" ADD CONSTRAINT "packaging_packets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_packet_components" ADD CONSTRAINT "packaging_packet_components_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "packaging_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_packet_components" ADD CONSTRAINT "packaging_packet_components_component_type_id_fkey" FOREIGN KEY ("component_type_id") REFERENCES "packaging_component_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_pack_instruction_steps" ADD CONSTRAINT "packaging_pack_instruction_steps_packet_component_id_fkey" FOREIGN KEY ("packet_component_id") REFERENCES "packaging_packet_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_artworks" ADD CONSTRAINT "packaging_artworks_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "packaging_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_artworks" ADD CONSTRAINT "packaging_artworks_packet_component_id_fkey" FOREIGN KEY ("packet_component_id") REFERENCES "packaging_packet_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_artworks" ADD CONSTRAINT "packaging_artworks_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_imports" ADD CONSTRAINT "packaging_imports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_activity" ADD CONSTRAINT "packaging_activity_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "packaging_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_activity" ADD CONSTRAINT "packaging_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

