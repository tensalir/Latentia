# VES-003: Nano Banana Pro Generations Get Stuck While Seedream 4.5 Works

## Status: 🔴 BLOCKED - Webhook Callbacks Not Received

## Problem Summary

Nano Banana Pro generations consistently get stuck in "processing" state (showing "Stuck 6min+"), while Seedream 4.5 generations using the **same Replicate backend** complete successfully.

Both models:
- Use Replicate API
- Are called from the same `/api/generate/process` endpoint
- Have similar polling logic

Yet only Nano Banana Pro gets stuck. This is unexpected and indicates a subtle difference in how they're processed.

---

## Comparison: Seedream 4.5 vs Nano Banana Pro

| Aspect | Seedream 4.5 | Nano Banana Pro |
|--------|--------------|-----------------|
| **Adapter** | `ReplicateAdapter` (direct) | `GeminiAdapter` (with Replicate fallback) |
| **Model Path** | `bytedance/seedream-4.5` | `google/nano-banana-pro` |
| **Code Path** | `lib/models/adapters/replicate.ts` | `lib/models/adapters/gemini.ts` → `generateImageReplicate()` |
| **Polling Attempts** | 120 (10 min) | 120 (10 min) ← *was 60, now fixed* |
| **Status** | ✅ Works | ❌ Gets Stuck |

### Key Difference: Code Path Complexity

**Seedream 4.5** uses a simple direct path:
```
ReplicateAdapter.generate() 
  → generateImage() 
    → fetch Replicate API 
    → poll for result
```

**Nano Banana Pro** has more layers:
```
GeminiAdapter.generate()
  → generateImage()
    → if USE_REPLICATE_DIRECTLY:
      → generateImageReplicate()  ← separate method
        → fetch Replicate API
        → poll for result
    → else: (disabled)
      → try Vertex AI (404)
      → try Gemini API (429)
      → fall back to Replicate
```

---

## Potential Root Causes

### 1. Vercel Function Timeout (Most Likely)

**The Problem:**
- Vercel serverless functions have execution time limits
- **Hobby plan**: 10 seconds max
- **Pro plan**: 60 seconds default, up to 300 seconds with config
- **Enterprise**: Up to 900 seconds

**Current Config** (`vercel.json`):
```json
{
  "functions": {
    "app/api/generate/process/route.ts": {
      "maxDuration": 300
    }
  }
}
```

**Why This Might Not Work:**
- `maxDuration: 300` requires **Vercel Pro or Enterprise plan**
- If you're on Hobby plan, this setting is **ignored** and you get 10 seconds
- Replicate predictions typically take 30-120 seconds

**To Verify:**
1. Check your Vercel plan at https://vercel.com/dashboard
2. Look at Vercel function logs for timeout errors

### 2. Replicate Model Cold Start Time

Different models on Replicate have different cold start characteristics:

| Model | Typical Time | Cold Start |
|-------|--------------|------------|
| Seedream 4.5 | 15-45 sec | Fast (popular model) |
| Nano Banana Pro | 30-90 sec | Slower (less popular?) |

If Nano Banana Pro consistently takes longer, it's more likely to hit the Vercel timeout.

### 3. Concurrent Request Limits

**Replicate API Rate Limits:**
- No explicit concurrent request limit documented
- But there may be per-model queuing

**Vercel Concurrent Execution:**
- Functions can run in parallel, but each has its own timeout
- No global queue that would cause one model to work and another to fail

### 4. Return Value Structure Difference

**Seedream (ReplicateAdapter)** returns:
```typescript
return {
  id: `gen-${Date.now()}`,
  status: 'completed',
  outputs: outputs,  // Array of { url, width, height }
}
```

**Nano Banana Pro (GeminiAdapter)** `generateImageReplicate()` returns:
```typescript
return {
  url: outputUrl,
  width: dimensions.width,
  height: dimensions.height,
}
```

Then the wrapper adds:
```typescript
outputs.push(output)  // output = { url, width, height }
return {
  id: `gen-${Date.now()}`,
  status: 'completed',
  outputs,
}
```

**This structure should be compatible**, but worth verifying in logs.

---

## Debugging Steps

### Step 1: Confirm Vercel Plan

```
Vercel Dashboard → Settings → Billing
```

If on **Hobby plan**:
- `maxDuration: 300` is ignored
- Actual timeout is 10 seconds
- **This would explain everything**

### Step 2: Check Function Logs

In Vercel Dashboard → Functions → Logs, look for:
- `FUNCTION_INVOCATION_TIMEOUT`
- Any error after ~10 or ~60 seconds
- Logs showing generation started but no completion

### Step 3: Compare Timing

Add more granular logging to both adapters:

```typescript
console.log(`[${modelName}] Poll attempt ${attempt}: ${statusData.status} @ ${Date.now()}`)
```

### Step 4: Test with Simple Prompt

Try generating with both models using identical, simple prompts:
- Prompt: "A red apple on a white background"
- No reference images
- 1:1 aspect ratio
- 1K resolution

This eliminates prompt complexity as a variable.

---

## Proposed Solutions

### Solution A: Upgrade to Vercel Pro (Recommended)

If on Hobby plan, upgrade to Pro to enable:
- 300 second function timeout
- Better observability
- More concurrent executions

**Cost:** ~$20/month

### Solution B: Use Webhooks Instead of Polling

Instead of polling in the serverless function:

1. Submit prediction to Replicate with webhook URL
2. Return immediately from API (no timeout issue)
3. Replicate calls webhook when done
4. Webhook updates database

**Pros:**
- Works on any Vercel plan
- More reliable for long-running tasks
- Better resource usage

**Cons:**
- More complex implementation
- Requires public webhook endpoint
- Need to handle webhook security

### Solution C: Use Replicate's Async API

Replicate supports async predictions:
```typescript
const prediction = await replicate.predictions.create({
  version: "...",
  input: { ... },
  webhook: "https://your-app.vercel.app/api/webhooks/replicate",
  webhook_events_filter: ["completed"]
})
```

### Solution D: Queue-Based Processing

Use a proper job queue (e.g., Inngest, Trigger.dev, or BullMQ):
1. API creates job in queue
2. Return immediately to user
3. Background worker processes job (no timeout limit)
4. Updates database when done

---

## Files Involved

- `lib/models/adapters/gemini.ts` - Nano Banana Pro adapter with Replicate fallback
- `lib/models/adapters/replicate.ts` - Seedream 4.5 adapter
- `app/api/generate/process/route.ts` - Background processing endpoint
- `vercel.json` - Function timeout configuration

---

## Quick Verification Checklist

- [ ] Check Vercel plan (Hobby vs Pro)
- [ ] Check Vercel function logs for timeout errors
- [ ] Confirm `maxDuration: 300` is actually being applied
- [ ] Test Nano Banana Pro on Replicate Playground directly (isolate the issue)
- [ ] Compare execution times between both models

---

## Timeline

| Date | Event |
|------|-------|
| Dec 17, 2025 | Issue identified: Nano Banana Pro stuck, Seedream works |
| Dec 17, 2025 | Added `USE_REPLICATE_DIRECTLY = true` to bypass Vertex/Gemini |
| Dec 17, 2025 | Added `vercel.json` with `maxDuration: 300` |
| Dec 17, 2025 | Increased polling attempts from 60 to 120 |
| Dec 17, 2025 | Issue persists - likely Vercel plan limitation |

---

## Resolution: Webhook Implementation (Dec 17, 2025)

We implemented the webhook-based solution, eliminating timeout issues entirely.

### New Files Created:
- `app/api/webhooks/replicate/route.ts` - Receives completion callbacks from Replicate
- `lib/models/replicate-utils.ts` - Shared utilities for webhook submission

### How It Works Now:
```
BEFORE (Polling - caused timeouts):
Generate → Start polling → Wait 5s → Check → Wait 5s → ... → TIMEOUT ❌

AFTER (Webhooks - no timeouts):
Generate → Submit to Replicate with webhook URL → Return immediately ✅
   ... later (30-90 seconds) ...
Replicate → POST /api/webhooks/replicate → Update DB → Realtime notifies frontend ✅
```

### Key Changes:
1. Generate route now submits directly to Replicate with webhook URL
2. Webhook endpoint handles completion, uploads to storage, updates DB
3. Existing Supabase realtime handles frontend updates
4. Polling-based approach kept as fallback for non-Replicate models

### Commit:
- `1298894` - feat: Add Replicate webhooks for timeout-free generation

### Environment Variables (Optional):
```bash
# For webhook signature verification (recommended for production)
REPLICATE_WEBHOOK_SECRET=your-secret-here

# To disable webhooks and use polling (not recommended)
USE_REPLICATE_WEBHOOKS=false
```

---

## Update (Dec 17, 2025): Webhooks Not Receiving Callbacks

### Problem: Webhook Submissions Succeed, But Callbacks Never Arrive

The webhook implementation is correctly submitting predictions to Replicate:

```
✅ [28f2cfb5...] Using webhook-based generation for gemini-nano-banana-pro
✅ [28f2cfb5...] Submitting to Replicate with webhook: https://loopvesper-one.vercel.app/api/webhooks/replicate
✅ [Replicate] Prediction submitted: zb52qp3e8hrme0cv5dca5xf8xc, status: starting
✅ [28f2cfb5...] ✅ Prediction submitted: zb52qp3e8hrme0cv5dca5xf8xc
```

**BUT** there is no corresponding webhook callback log:
```
❌ [Replicate Webhook] Received: prediction=zb52qp3e8hrme0cv5dca5xf8xc, status=succeeded
```

This means **Replicate is not calling our webhook endpoint**, or the call is failing before logging.

### Possible Causes

1. **Webhook URL not accessible**: Vercel might be blocking the incoming webhook
2. **Replicate not sending webhooks**: Model or API issue
3. **Webhook endpoint error**: The endpoint might be crashing before logging
4. **URL mismatch**: The webhook URL might be incorrect

### Debugging Steps

1. **Check Replicate Dashboard**:
   - Go to https://replicate.com/predictions
   - Find prediction `zb52qp3e8hrme0cv5dca5xf8xc`
   - Check if webhook was attempted and what error occurred

2. **Test Webhook Endpoint Manually**:
   ```bash
   curl -X POST https://loopvesper-one.vercel.app/api/webhooks/replicate \
     -H "Content-Type: application/json" \
     -d '{"id":"test","status":"succeeded","output":["https://example.com/test.png"]}'
   ```

3. **Check Vercel Logs for Webhook Route**:
   - Filter by `/api/webhooks/replicate`
   - Look for any incoming requests or errors

4. **Verify Webhook Endpoint is Deployed**:
   - Visit: https://loopvesper-one.vercel.app/api/webhooks/replicate
   - Should return: `{"status":"ok","message":"Replicate webhook endpoint is active"}`

### Additional Fix Applied

Fixed duplicate prediction issue where frontend fallback was also triggering:
- `b9644ac` - Fix: Prevent duplicate predictions when using webhooks

### Current Status: 🔴 BLOCKED

Webhooks are submitted but callbacks never arrive. Need to:
1. Verify webhook endpoint is accessible
2. Check Replicate prediction status/webhook delivery logs
3. Consider adding webhook retry logic or fallback to polling

## Next Steps

1. ~~**Immediate**: Confirm Vercel plan~~ ✅ Upgraded to Pro
2. ~~**Short-term**: Implement webhook solution~~ ✅ Done (but not working)
3. **URGENT**: Debug why webhook callbacks are not being received
4. **Fallback**: Consider re-enabling polling for now until webhooks work
