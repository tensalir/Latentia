# packaging-files bucket

Create a **private** Supabase Storage bucket named `packaging-files` for Packaging Studio uploads and generated PDFs.

In Supabase Dashboard → Storage → New bucket:

- Name: `packaging-files`
- Public: **off** (signed URLs only)

Service role (used by API routes) can upload/read. Browser uploads use `createSignedUploadUrl`.

After creating the bucket, apply the Prisma migration:

```pwsh
# Option A: run SQL migration
# prisma/migrations/20260522120000_add_packaging_studio/migration.sql

# Option B: if schema is in sync
npx prisma db push
npx prisma generate
```

Seed Nyx sample packet (requires archive .ai files in `tmp/packaging-intake/archive/`):

```pwsh
npm run packaging:seed-nyx
```
