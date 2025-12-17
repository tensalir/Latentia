# Architecture: Why Seedream Works but Nano Banana Pro Doesn't

## Request Flow Comparison

### Seedream 4.5 (✅ Works)

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend                                                         │
│ useGenerateMutation.ts                                          │
│ ↓ POST /api/generate                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ API: /api/generate/route.ts                                     │
│ 1. Create generation in DB (status: 'processing')              │
│ 2. Trigger /api/generate/process (fire-and-forget)             │
│ 3. Return generation ID to frontend                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ API: /api/generate/process/route.ts                             │
│ ⏱️ Vercel timeout applies here (10s Hobby / 300s Pro)          │
│                                                                  │
│ 1. Load generation from DB                                      │
│ 2. Get model adapter: ReplicateAdapter                          │
│ 3. Call adapter.generate()                                      │
│    ↓                                                            │
│    ┌──────────────────────────────────────────────────────────┐│
│    │ ReplicateAdapter.generateImage()                         ││
│    │ • POST to Replicate API (create prediction)              ││
│    │ • Poll every 5 seconds for result                        ││
│    │ • Seedream typically completes in 15-45 seconds          ││
│    │ • ✅ Completes before timeout                            ││
│    └──────────────────────────────────────────────────────────┘│
│ 4. Upload output to Supabase storage                            │
│ 5. Update generation status to 'completed'                      │
└─────────────────────────────────────────────────────────────────┘
```

### Nano Banana Pro (❌ Gets Stuck)

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend                                                         │
│ useGenerateMutation.ts                                          │
│ ↓ POST /api/generate                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ API: /api/generate/route.ts                                     │
│ (Same as Seedream)                                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ API: /api/generate/process/route.ts                             │
│ ⏱️ Vercel timeout applies here (10s Hobby / 300s Pro)          │
│                                                                  │
│ 1. Load generation from DB                                      │
│ 2. Get model adapter: GeminiAdapter                             │
│ 3. Call adapter.generate()                                      │
│    ↓                                                            │
│    ┌──────────────────────────────────────────────────────────┐│
│    │ GeminiAdapter.generateImage()                            ││
│    │ • USE_REPLICATE_DIRECTLY = true                          ││
│    │ • Calls generateImageReplicate()                         ││
│    │   ↓                                                       ││
│    │   ┌────────────────────────────────────────────────────┐ ││
│    │   │ generateImageReplicate()                           │ ││
│    │   │ • POST to Replicate API (create prediction)        │ ││
│    │   │ • Poll every 5 seconds for result                  │ ││
│    │   │ • Nano Banana Pro takes 30-90+ seconds             │ ││
│    │   │ • ❌ TIMEOUT before completion                      │ ││
│    │   └────────────────────────────────────────────────────┘ ││
│    └──────────────────────────────────────────────────────────┘│
│                                                                  │
│ ❌ Function killed by Vercel before reaching step 4-5           │
│ Generation stays in 'processing' state forever                  │
└─────────────────────────────────────────────────────────────────┘
```

## The Core Problem

```
┌────────────────────────────────────────────────────────────────────┐
│                     VERCEL TIMEOUT WALL                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Hobby Plan: 10 seconds      │█████████████░░░░░░░░░░░░░░░░░░░░│   │
│  Seedream:   15-45 seconds   │██████████████████████░░░░░░░░░░░│   │
│  Nano Banana: 30-90 seconds  │███████████████████████████████████│ │
│                                                                    │
│  Pro Plan:   300 seconds     │████████████████████████████████████││
│                              ↑                                     │
│                              │                                     │
│                        Both models would                           │
│                        complete within limit                       │
└────────────────────────────────────────────────────────────────────┘
```

## Why Doesn't the Timeout Apply to Seedream?

It does! But Seedream is faster:

| Model | Cold Start | Generation | Total | Fits in 10s? |
|-------|------------|------------|-------|--------------|
| Seedream 4.5 | ~5s | ~10-30s | ~15-35s | Sometimes |
| Nano Banana Pro | ~10s | ~20-60s | ~30-70s | Never |

If Seedream happens to complete within 10 seconds (on a warm instance), it works.
Nano Banana Pro almost never completes that fast.

## Solution Architecture: Webhooks

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend                                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ API: /api/generate/route.ts                                     │
│ 1. Create generation in DB (status: 'processing')              │
│ 2. Submit to Replicate with webhook URL                         │
│ 3. Return immediately (no waiting!)                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (async, seconds later)
┌─────────────────────────────────────────────────────────────────┐
│ Replicate processes in background                                │
│ (Takes as long as needed - 30s, 90s, doesn't matter)            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (when done)
┌─────────────────────────────────────────────────────────────────┐
│ Webhook: /api/webhooks/replicate                                 │
│ 1. Receive completion notification                              │
│ 2. Download output                                              │
│ 3. Upload to Supabase                                           │
│ 4. Update generation status to 'completed'                      │
│                                                                  │
│ ✅ This function only runs for a few seconds (well under limit) │
└─────────────────────────────────────────────────────────────────┘
```

## Current vs Recommended Architecture

### Current (Polling-Based)
- ❌ Vulnerable to timeouts
- ❌ Wastes compute waiting for Replicate
- ❌ Different behavior on different Vercel plans

### Recommended (Webhook-Based)
- ✅ Works on any Vercel plan
- ✅ No wasted compute
- ✅ Scales to any model speed
- ✅ More reliable

## Implementation Effort

| Approach | Time | Risk |
|----------|------|------|
| Upgrade to Vercel Pro | 5 min | Low |
| Add webhook support | 2-4 hours | Medium |
| Full queue system | 1-2 days | Low (but more work) |
