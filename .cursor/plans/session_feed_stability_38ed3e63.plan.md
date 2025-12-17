# Session feed stability & best-practices refresh

## What’s happening (root causes)

- **Broken cursor pagination for UUIDs**: [`app/api/generations/route.ts`](app/api/generations/route.ts) uses `id > cursor` while ordering by `createdAt`. With UUIDs this produces missing/duplicated rows on refetch, so “processing” items can drop out and later reappear.
- **Unstable feed layout**: [`components/generation/GenerationGallery.tsx`](components/generation/GenerationGallery.tsx) renders **processing/completed/cancelled in separate sections**, so a generation “moves” when status flips.
- **Scroll jank**: [`components/generation/GenerationInterface.tsx`](components/generation/GenerationInterface.tsx) **always** scrolls to bottom on any generations change; when content height changes, that can look like random scroll jumps.
- **Over-broad realtime invalidations**: [`hooks/useGenerationsRealtime.ts`](hooks/useGenerationsRealtime.ts) subscribes to *all* `outputs` inserts (no filter), causing unnecessary refetches.

## Target UX (per your selections)

- **Newest at bottom** (near the prompt).
- **Auto-scroll only when you’re already near the bottom**; otherwise keep position and show a “new items” affordance.

## Backend: make pagination correct + deterministic

- Update [`app/api/generations/route.ts`](app/api/generations/route.ts):
- **Switch to keyset pagination** using `(createdAt, id)` (UUID-safe).
- **Return newest-first** from the API (order by `createdAt desc`, `id desc`).
- Replace `whereClause.id = { gt: cursor }` with:
- `createdAt < cursorCreatedAt` OR (`createdAt == cursorCreatedAt` AND `id < cursorId`).
- Encode `nextCursor` as an opaque string (e.g. base64url JSON `{ createdAt, id }`).
- Keep response shape `{ data, nextCursor, hasMore }`.

## Frontend data: align infinite query + optimistic updates with new paging

- Update [`hooks/useInfiniteGenerations.ts`](hooks/useInfiniteGenerations.ts):
- Treat `nextCursor` as opaque; no UUID comparisons client-side.
- Consider reducing/removing `refetchInterval` on the infinite query (avoid refetching all pages every 2s); rely on realtime + a slower fallback.
- Update [`hooks/useGenerateMutation.ts`](hooks/useGenerateMutation.ts):
- Cancel **both** caches (`['generations', sessionId]` and `['generations','infinite', sessionId]`).
- Optimistically insert the new “processing” generation into **page 0** (newest-first API).
- If the infinite cache is empty/undefined, **initialize** it with a first page containing the optimistic generation.
- Add a stable `clientId` (optional) to avoid remount flicker when replacing temp IDs.
- Update [`types/generation.ts`](types/generation.ts):
- Add `clientId?: string` to `Generation`/`GenerationWithOutputs` (used as React `key` fallback).

## UI: keep items from moving + fix scrolling

- Refactor [`components/generation/GenerationGallery.tsx`](components/generation/GenerationGallery.tsx):
- Render **one ordered list** (no separate maps for cancelled/completed/processing).
- Within each row, branch UI by `status` so status transitions update **in place**.
- Refactor [`components/generation/GenerationInterface.tsx`](components/generation/GenerationInterface.tsx):
- Build a `displayGenerations` array in chronological order:
- flatten newest-first pages → reverse once to show **oldest → newest**.
- Implement **“pinned to bottom”** logic:
- Track whether the user is within a small threshold of bottom.
- Only auto-scroll on updates when pinned or when switching sessions.
- When not pinned and new items arrive, show a small **“New items”** button to jump to bottom.
- Change infinite loading trigger to **top-of-feed** (scroll up loads older):
- Move the sentinel to the top.
- Preserve scroll position when prepending older items (measure scrollHeight before/after and adjust scrollTop).

## Realtime: reduce unnecessary refetches

- Update [`hooks/useGenerationsRealtime.ts`](hooks/useGenerationsRealtime.ts):
- Remove or heavily constrain the `outputs` table subscription (currently unfiltered).
- Keep generation subscription scoped to `session_id=eq.<sessionId>`.
- Prefer **targeted cache updates** (setQueryData) or a debounced invalidate only on relevant events.

## Test plan (manual)

- In a session with >10 generations:
- Generate while pinned to bottom: processing card stays visible; completes in-place; **no disappear/reappear**.
- Scroll up and generate: your scroll position stays; “New items” indicator appears; clicking it jumps to bottom.
- Let a generation fail: failed item remains visible with error.
- Cancel a generation: status updates in-place.
- Load older items by scrolling to top: no jump when older rows prepend.