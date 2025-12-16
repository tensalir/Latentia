---
name: Fix Gemini SDK and UI State
overview: Revert to the working @google-cloud/vertexai SDK for Gemini image generation, and fix the UI state management to prevent generations from disappearing (debounce real-time invalidation, fix ordering, preserve errors).
todos:
  - id: revert-sdk
    content: Revert gemini.ts to use @google-cloud/vertexai SDK (working version from commit 3adbb5b)
    status: pending
  - id: update-package
    content: "Update package.json: remove @google/genai, ensure @google-cloud/vertexai is present"
    status: pending
  - id: fix-ordering
    content: "Fix useGenerateMutation.ts: add new generations to END of list (line 126)"
    status: pending
  - id: debounce-realtime
    content: "Fix useGenerationsRealtime.ts: debounce invalidation by 2 seconds to prevent race condition"
    status: pending
  - id: preserve-errors
    content: Update onError handler to also update infinite query cache so errors persist
    status: pending
  - id: test-generation
    content: Test Nano Banana Pro and Seedream to verify generations work and don't disappear
    status: pending
---

# Fix Gemini SDK and UI State Management

## Problem Summary

Two root causes identified:

1. **SDK Migration Broke Image Generation** (commit `9f736fc`): Switched from working `@google-cloud/vertexai` to `@google/genai` with incorrect API usage
2. **UI State Race Condition**: Real-time subscription immediately invalidates queries, wiping out optimistic updates before the database record exists

## Part 1: Revert Gemini SDK to Working Version

### Changes to `lib/models/adapters/gemini.ts`

Revert to `@google-cloud/vertexai` SDK which was working:

```typescript
// BEFORE (broken):
const { GoogleGenAI } = require('@google/genai')
genAiClient = new GoogleGenAI({ vertexai: true, project, location })

// AFTER (working):
const { VertexAI } = require('@google-cloud/vertexai')
vertexAiClient = new VertexAI({
  project: projectId,
  location,
  ...(credentials && { googleAuthOptions: { credentials } }),
})
```

**Key fixes:**

- Use `vertexAiClient.preview.getGenerativeModel()` (not `genAiClient.models.generateContent()`)
- Remove `role: 'user'` from payload contents (not needed)
- Use lowercase `responseModalities: ['image']` (not uppercase)
- Remove all debug instrumentation (`fetch` to localhost)
- Keep the retry logic and rate limiting (good additions)

### Package.json Change

```json
// Remove:
"@google/genai": "..."

// Keep (or re-add if removed):
"@google-cloud/vertexai": "^1.x.x"
```

## Part 2: Fix UI State Management

### Issue 1: Wrong Ordering

**File:** `hooks/useGenerateMutation.ts` line 126

```typescript
// BEFORE (adds to start - wrong):
return { ...page, data: [optimisticGeneration, ...page.data] }

// AFTER (adds to end - chronological):
return { ...page, data: [...page.data, optimisticGeneration] }
```

### Issue 2: Real-time Invalidation Race Condition

**File:** `hooks/useGenerationsRealtime.ts`

The current code immediately invalidates queries on ANY database change:

```typescript
// CURRENT (causes race condition):
queryClient.invalidateQueries({ queryKey: ['generations', 'infinite', sessionId] })
```

**Fix:** Debounce invalidation and merge updates instead of full refetch:

```typescript
// NEW: Debounce invalidation by 2 seconds
const debouncedInvalidate = useMemo(() => 
  debounce(() => {
    queryClient.invalidateQueries({ 
      queryKey: ['generations', 'infinite', sessionId],
      refetchType: 'active'
    })
  }, 2000),
  [sessionId, queryClient]
)
```

### Issue 3: Preserve Failed Generations

**File:** `hooks/useGenerateMutation.ts`

The `onError` handler updates the optimistic generation to show the error, but real-time invalidation can still wipe it out. Also update the infinite query cache on error:

```typescript
onError: (error, variables, context) => {
  // Update BOTH caches to show error
  queryClient.setQueryData(['generations', variables.sessionId], ...)
  queryClient.setQueryData(['generations', 'infinite', variables.sessionId], ...)
}
```

## Part 3: Best Practices for Error Visibility

### Add Error Toast for API Failures

Show a toast notification when generation fails so users know something went wrong.

### Never Remove Failed Generations

Failed generations should remain in the feed with a clear error indicator until manually dismissed or retried.

### Add Timeout Handling

If a generation is stuck in "processing" for too long (e.g., 5 minutes), automatically mark it as failed with a timeout message.

## Files to Modify

| File | Changes |

|------|---------|

| `lib/models/adapters/gemini.ts` | Revert to @google-cloud/vertexai SDK, remove debug logs, keep retry logic |

| `package.json` | Swap @google/genai for @google-cloud/vertexai |

| `hooks/useGenerateMutation.ts` | Fix ordering (add to end), update infinite cache on error |

| `hooks/useGenerationsRealtime.ts` | Debounce invalidation (2s delay) |

## Expected Results

1. Image generation works again (Nano Banana Pro, Seedream)
2. New generations appear at the **bottom** of the feed (chronological)
3. Generations never "disappear" at 5%
4. Failed generations stay visible with error messages
5. Better user feedback on errors