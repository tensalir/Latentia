---
name: Dashboard homepage redesign
overview: Redesign the app’s homepage into a shadcn-style dashboard shell (left sidebar + top header), add a real `/` dashboard overview, and refactor key high-level pages to use the same layout—while keeping `/projects/[id]` (workspace) untouched.
todos:
  - id: add-dashboard-layout
    content: Create `(dashboard)` route group layout with sidebar + header shell and centralized auth gating.
    status: completed
  - id: build-sidebar
    content: Implement `DashboardSidebar` with active route styling and nav items (/, /projects, /review, /bookmarks, /settings).
    status: completed
    dependencies:
      - add-dashboard-layout
  - id: dashboard-home
    content: Implement new `/` dashboard overview page with quick actions + recent projects.
    status: completed
    dependencies:
      - add-dashboard-layout
      - build-sidebar
  - id: projects-section
    content: Move/refactor `/projects` into the dashboard shell and simplify UI to a clean projects section.
    status: completed
    dependencies:
      - add-dashboard-layout
      - build-sidebar
  - id: review-route
    content: Create `/review` route by extracting existing Review UI and update links/buttons to point to it.
    status: completed
    dependencies:
      - add-dashboard-layout
      - build-sidebar
  - id: move-bookmarks-settings
    content: Move Bookmarks (and Settings) pages under the dashboard shell and remove duplicate chrome.
    status: completed
    dependencies:
      - add-dashboard-layout
      - build-sidebar
---

# Dashboard-style homepage + sidebar shell

## Goals

- Make `/` a **real dashboard overview** (no redirect) with a **left sidebar** inspired by the shadcn dashboard example ([reference](https://ui.shadcn.com/examples/dashboard)).
- Keep the UI **functional, not filler**: surface existing objects/actions (projects, review, bookmarks, new project) instead of fake stats/graphs.
- Apply the **sidebar shell only to high-level pages** (per your choice) and **not** to `/projects/[id]`.

## Key design decisions (based on your answers)

- `/` becomes the dashboard overview.
- Sidebar appears on dashboard-level routes only (not inside project workspace).

## Implementation approach

### 1) Introduce a dashboard route group + shared shell

- Add a new route group layout: `[app/(dashboard)/layout.tsx](app/\\(dashboard)/layout.tsx)`.
- Layout structure mirrors shadcn’s dashboard pattern:
- Sticky/scroll-safe **left sidebar** (desktop)
- **Top header** with global actions (theme toggle, settings, sign out, admin spending)
- Main content area with consistent padding/max width
- Add small client components under the layout to keep it interactive:
- `components/layout/DashboardSidebar.tsx` (active route highlighting)
- `components/layout/DashboardHeader.tsx` (theme toggle, sign out, admin spending)
- `components/auth/RequireAuth.tsx` (centralize “if not logged in → /login” for all dashboard pages)

### 2) Build the sidebar navigation (shadcn-style)

- Implement `components/layout/DashboardSidebar.tsx`:
- Nav items: **Dashboard** (`/`), **Projects** (`/projects`), **Review** (`/review`), **Bookmarks** (`/bookmarks`), **Settings** (`/settings`).
- Use `usePathname()` to style the active item.
- Keep it minimal, card-like, and high-contrast with your existing tokens (`bg-muted/40`, `border-border`, etc.).

### 3) Create the new dashboard homepage at `/`

- Add `[app/(dashboard)/page.tsx](app/\\(dashboard)/page.tsx)`.
- Content (no fake metrics):
- “Quick actions” card row (e.g., **New Project**, **Continue latest project**, **Review approved items**, **Open Bookmarks**).
- “Recent projects” section using `useProjects()` + existing `ProjectGrid`, showing a limited set with a “View all” link.
- Proper empty state when no projects exist (reuse the existing New Project flow).

### 4) Refactor `/projects` into a clean “Projects” section

- Move [`app/projects/page.tsx`](app/projects/page.tsx) → `[app/(dashboard)/projects/page.tsx](app/\\(dashboard)/projects/page.tsx)`.
- Simplify the page:
- Remove the bespoke centered header + background image frame.
- Keep the project list + `NewProjectDialog`.
- Optional: add lightweight search/filter (only if it genuinely improves usability).

### 5) Promote “Review” to a first-class route

- Extract the existing `ReviewTabContent` UI from the old projects page into `[app/(dashboard)/review/page.tsx](app/\\(dashboard)/review/page.tsx)`.
- Update navigation that points to review:
- Update [`components/navbar/Navbar.tsx`](components/navbar/Navbar.tsx) “Approved assets” button to route to `/review`.

### 6) Bring Bookmarks (and optionally Settings) under the shell

- Move [`app/bookmarks/page.tsx`](app/bookmarks/page.tsx) → `[app/(dashboard)/bookmarks/page.tsx](app/\\(dashboard)/bookmarks/page.tsx)` and remove its duplicate fixed navbar/theme UI (the shell will handle it).
- Move [`app/settings/page.tsx`](app/settings/page.tsx) → `[app/(dashboard)/settings/page.tsx](app/\\(dashboard)/settings/page.tsx)` and adjust the header/back affordance for the new navigation model.

### 7) Keep the project workspace untouched

- Leave `[app/projects/[id]/page.tsx](app/projects/[id]/page.tsx) `outside `(dashboard)` so it **does not** inherit the sidebar shell.

## Notes on best-practice UX (what we’ll bake in)

- Consistent layout primitives (sidebar/header/content) and reduced per-page duplicated chrome.
- Accessible nav (proper semantics, focus styles, icon buttons with titles/labels).
- Responsive behavior (sidebar collapses/turns into a drawer on mobile if we add `Sheet`; otherwise sidebar hides on small screens and header keeps core actions).

## Files likely touched

- `[app/(dashboard)/layout.tsx](app/\\(dashboard)/layout.tsx)` (new)
- `[app/(dashboard)/page.tsx](app/\\(dashboard)/page.tsx)` (new)
- `[app/(dashboard)/projects/page.tsx](app/\\(dashboard)/projects/page.tsx)` (moved/refactored)
- `[app/(dashboard)/review/page.tsx](app/\\(dashboard)/review/page.tsx)` (new)
- `[app/(dashboard)/bookmarks/page.tsx](app/\\(dashboard)/bookmarks/page.tsx)` (moved/refactored)
- `[app/(dashboard)/settings/page.tsx](app/\\(dashboard)/settings/page.tsx)` (moved/refactored)
- [`components/layout/DashboardSidebar.tsx`](components/layout/DashboardSidebar.tsx) (new)
- [`components/layout/DashboardHeader.tsx`](components/layout/DashboardHeader.tsx) (new)
- [`components/auth/RequireAuth.tsx`](components/auth/RequireAuth.tsx) (new)