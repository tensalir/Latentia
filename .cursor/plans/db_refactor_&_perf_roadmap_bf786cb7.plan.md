---
name: DB Refactor & Perf Roadmap
overview: Create a staged plan to refactor the database safely while improving project/session/gallery load times, preserving sharing semantics, and preparing for future scale.
todos:
  - id: prisma-migrate-foundation
    content: "Make Prisma Migrate the deployment source of truth: stop ignoring `prisma/migrations`, create/commit a baseline migration, and add a CI deploy step running `prisma migrate deploy`."
    status: pending
  - id: perf-measurement
    content: Add lightweight DB/query observability (Prisma middleware timings + basic endpoint latency metrics; optionally enable pg_stat_statements) and define P95 targets for projects/sessions/gallery endpoints.
    status: pending
    dependencies:
      - prisma-migrate-foundation
  - id: projects-list-query
    content: Optimize `/api/projects/with-thumbnails` using a single SQL query + cursor pagination; validate with EXPLAIN and real data volumes.
    status: pending
    dependencies:
      - perf-measurement
  - id: index-migrations
    content: Add/adjust composite and partial indexes to match real query shapes (generations latest-completed; outputs latest image; sessions visibility filter). Ship as Prisma migrations.
    status: pending
    dependencies:
      - prisma-migrate-foundation
      - projects-list-query
  - id: reduce-overfetch
    content: Reduce payloads on `/api/projects/[id]` (select minimal fields, make sessions include opt-in) and align frontend fetching to React Query where appropriate.
    status: pending
    dependencies:
      - projects-list-query
  - id: project-stats-read-model
    content: If Phase 1 isn’t sufficient at target scale, introduce a `ProjectStats` read model maintained transactionally on writes (session create/delete, output insert/delete) plus a repair/backfill job.
    status: pending
    dependencies:
      - index-migrations
---

# Database refactor + performance roadmap (Loop Vesper)

## Goals

- **Faster loads** for project list, sessions list, and galleries as user count + generation volume grows.
- **Safe refactors** (repeatable migrations, non-breaking rollouts).
- **Robust multi-user semantics** stay intact: `Project.isShared` controls broad visibility; `Session.isPrivate` controls visibility within a project; **writes remain restricted** to owners/members.
- **Security + scalability** improvements only when they pay off.

## What we have today (key constraints)

- **Migrations aren’t a reliable deployment artifact yet** because `prisma/migrations` is currently ignored in `.gitignore` (`.gitignore` ignores `prisma/migrations`). That makes DB refactors risky.
- **Hot endpoints**:
- Project list uses [`app/api/projects/with-thumbnails/route.ts`](app/api/projects/with-thumbnails/route.ts) and currently does multiple queries + scans many generations to find per-project thumbnails.
- Project detail fetch in [`app/api/projects/[id]/route.ts`](app/api/projects/[id]/route.ts) **overfetches** sessions even when the UI only needs name/owner.
- Current schema is reasonable for MVP; the next wins come from **query shape + indexes**, then optionally a **read model**.

## Recommended approach (best trade-off)

- **Phase 1 (now):** Query-only optimizations + targeted indexes + pagination. Lowest risk, immediate speedups.
- **Phase 2 (when needed):** Add a small **derived read model** (e.g., `ProjectStats`) maintained by the app in transactions + a repair job. This is fast and predictable with Prisma.
- **Phase 3 (later):** Only if scale demands it: **DB-trigger maintained summaries**, **read replicas**, **Redis**, or **partitioning**.

## Phased plan

### Phase 0 — Make DB changes safe (foundation)

- **Adopt Prisma Migrate as source of truth**:
- Stop ignoring `prisma/migrations` in [`.gitignore`](.gitignore).
- Create a baseline migration that matches production (or re-baseline cleanly) and commit it.
- Add a deploy step (preferably **GitHub Actions**, not Vercel build) to run `prisma migrate deploy` against production.
- **Add measurement**:
- Enable query timing (Prisma middleware) and/or Postgres query stats (`pg_stat_statements`) so we know what to optimize.
- Define success metrics: TTFB for `/projects`, P95 latency for key APIs, DB CPU, connection count.

### Phase 1 — Low-hanging performance wins

- **Rewrite project list query**:
- Replace the multi-step logic in [`app/api/projects/with-thumbnails/route.ts`](app/api/projects/with-thumbnails/route.ts) with a single SQL query (via `prisma.$queryRaw`) using Postgres `DISTINCT ON` (or a window function) to fetch:
  - projects the user can see
  - session count
  - latest *completed* image output thumbnail per project
- Add **cursor pagination** (e.g., `(updatedAt, id)` cursor) to avoid loading everything.
- **Reduce overfetching**:
- Update [`app/api/projects/[id]/route.ts`](app/api/projects/[id]/route.ts) to `select` only the fields the UI actually needs; make session inclusion opt-in (e.g., `?includeSessions=1`).
- **Index for real query shapes** (as migrations):
- `generations`: composite index for latest-completed lookup (e.g., `(session_id, status, created_at desc)`; consider partial index on `status='completed'`).
- `outputs`: composite index tuned for latest image thumbnail (e.g., `(generation_id, file_type, created_at desc)`; consider partial index on `file_type='image'`).
- `sessions`: index to support “project sessions visible to viewer” (e.g., `(project_id, is_private, updated_at desc)`).
- Verify with `EXPLAIN (ANALYZE, BUFFERS)` before/after.
- **Frontend alignment**:
- Prefer using [`hooks/useProjects.ts`](hooks/useProjects.ts) on [`app/projects/page.tsx`](app/projects/page.tsx) to leverage caching and reduce duplicate fetch logic.

### Phase 2 — Fast lists via a read model (when Phase 1 isn’t enough)

- Add `ProjectStats` (or `ProjectSummary`) table:
- `projectId (PK)`, `sessionCount`, `latestThumbnailUrl`, `lastActivityAt`, `latestOutputCreatedAt`, etc.
- Update write paths in transactions:
- on session create/delete: update counts
- on output insert (in [`app/api/generate/process/route.ts`](app/api/generate/process/route.ts)): update latest thumbnail + `lastActivityAt`
- on output delete: recompute latest thumbnail for that project (bounded query)
- Add a **repair/backfill job** (cron/manual endpoint restricted to admin) to recompute stats if anything drifts.

### Phase 3 — Bigger scalability moves (only if justified)

- **Connection pooling/caching**:
- If DB connections become a limiter: use the Supabase transaction pooler correctly and/or Prisma’s managed pooling/caching.
- **Read scaling**:
- Read replicas for read-heavy workloads.
- **Very large tables**:
- Partition `generations`/`outputs` by time or archive older rows.
- **Optional: DB-maintained summaries**:
- Triggers/materialized views if we want “always consistent” summaries at the DB layer (more complexity).

## Rollout strategy (avoid breaking changes)

- Add new columns/tables **without removing old paths**.
- Backfill/repair script.
- Switch reads to new model.
- Enforce constraints + remove old code only after metrics confirm stability.

## References (best practices)

- Prisma Data Guide: optimizing PostgreSQL queries: [link](https://www.prisma.io/dataguide/postgresql/reading-and-querying-data/optimizing-postgresql?utm_source=openai)
- Prisma Data Guide: relational infrastructure/architecture patterns: [link](https://www.prisma.io/dataguide/types/relational/infrastructure-architecture?utm_source=openai)
- Timescale Postgres performance practices (includes indexing + connection considerations): [link](https://www.timescale.com/learn/postgres-performance-best-practices?utm_source=openai)
- Prisma Accelerate (optional pooling/caching path if needed): [link](https://www.prismagraphql.com/accelerate?utm_source=openai)