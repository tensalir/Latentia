# Issue: Nano Banana Pro Stuck Processing

## Folder Contents

| File | Description |
|------|-------------|
| `ISSUE.md` | Full problem analysis with root causes and solutions |
| `QUICK_SUMMARY.md` | TL;DR version for quick reference |
| `gemini-adapter.ts` | Nano Banana Pro adapter code (uses Replicate fallback) |
| `replicate-adapter.ts` | Seedream 4.5 adapter code (direct Replicate) |
| `process-route.ts` | Background processing API endpoint |
| `vercel.json` | Vercel function timeout configuration |

## Key Question to Answer First

**What Vercel plan are you on?**

- **Hobby**: Max 10 second timeout → Nano Banana Pro will ALWAYS fail
- **Pro**: Max 300 second timeout → Should work with current config
- **Enterprise**: Max 900 second timeout → Should work

Check at: https://vercel.com/dashboard → Settings → Billing

## Sharing This Issue

To share with a developer:
1. Zip this entire folder
2. OR share the GitHub repo link with path `.linear-issues/nano-banana-pro-stuck-processing/`

## Quick Test

To verify it's a timeout issue, try running Nano Banana Pro directly on Replicate:
1. Go to https://replicate.com/google/nano-banana-pro
2. Enter the same prompt
3. Note how long it takes (usually 30-90 seconds)
4. If > 10 seconds, Hobby plan won't work
