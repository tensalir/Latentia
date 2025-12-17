# Stuck Generations Issue - File Reference

This folder contains a comprehensive breakdown of the stuck generations issue with 401 Unauthorized errors.

## Files in This Folder

### Documentation
- **`ISSUE.md`** - Main issue document with problem description, timeline, root cause analysis, and next steps
- **`README.md`** - This file

### Source Code Files (Current State)
- **`generate-route.ts`** - `/api/generate` endpoint that creates generation records
- **`generate-process-route.ts`** - `/api/generate/process` endpoint that processes generations asynchronously
- **`useGenerateMutation.ts`** - Frontend mutation hook with fallback trigger logic
- **`GenerationGallery.tsx`** - Component that displays generations and stuck badges
- **`GenerationInterface.tsx`** - Main generation feed component with dismiss handler

### Context Files
- **`session-feed-stability-plan.md`** - Original refactor plan that preceded this issue

## How to Use These Files

1. **Start with `ISSUE.md`** - Read the comprehensive problem breakdown
2. **Review the source files** - Understand the current implementation
3. **Check the refactor plan** - Understand what changed before the issue started
4. **Use for debugging** - Share with developer or use for investigation

## Key Points

- Issue started **after** successful session feed stability refactor
- Happens **intermittently** - same prompts work sometimes, fail other times
- Root cause appears to be **authentication failures** (401) when triggering background process
- Both server-side and frontend fallback triggers are failing

## Quick Links

- [Main Issue Document](./ISSUE.md)
- [Session Feed Stability Plan](./session-feed-stability-plan.md)
