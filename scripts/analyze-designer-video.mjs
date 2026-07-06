#!/usr/bin/env node
/**
 * Analyze a designer feedback video using the Gemini API.
 *
 * Designed for one-shot review of Loom / screen-recorded feedback from the
 * CMF designer (Damien). Uploads the video to the Gemini Files API (so it
 * works past the 20 MB inline limit), then runs a structured analysis
 * prompt that pulls out:
 *
 *   - what the designer praises / accepts as-is
 *   - what he wants changed, with timestamps
 *   - mapping of issues to surfaces in our CMF flow (PDF pages, clown
 *     legend, part-breakdown grid, etc.)
 *   - a ranked action list we can drop into a build plan
 *
 * Usage:
 *   node scripts/analyze-designer-video.mjs --file "<path-to-.mp4>"
 *
 * Optional:
 *   --env <path>   Env file with GEMINI_API_KEY (default: .env.local.gemini
 *                  if present, else .env.local).
 *   --model <id>   Gemini model (default: gemini-2.5-pro).
 *   --out <path>   Write the raw markdown analysis to a file as well.
 *
 * The script intentionally has no project deps — it uses the Files API
 * over `fetch` so it can be run from a clean checkout.
 */

import { readFile, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const VIDEO_PATH = arg('file')
const ENV_PATH = arg('env')
const MODEL = arg('model', 'gemini-2.5-pro')
const OUT_PATH = arg('out')

if (!VIDEO_PATH) {
  console.error('Missing --file <path-to-video>')
  process.exit(1)
}

async function loadEnv() {
  const candidates = ENV_PATH
    ? [ENV_PATH]
    : ['.env.local.gemini', '.env.local', '.env']
  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
        if (!match) continue
        const key = match[1]
        let value = match[2]
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        if (!process.env[key]) process.env[key] = value
      }
      console.error(`Loaded env from ${candidate}`)
      return
    } catch {
      // try next
    }
  }
}

await loadEnv()

const API_KEY = process.env.GEMINI_API_KEY
if (!API_KEY) {
  console.error('GEMINI_API_KEY not set after loading env files')
  process.exit(1)
}

const stats = await stat(VIDEO_PATH)
const mimeType = VIDEO_PATH.toLowerCase().endsWith('.mp4')
  ? 'video/mp4'
  : VIDEO_PATH.toLowerCase().endsWith('.mov')
    ? 'video/quicktime'
    : VIDEO_PATH.toLowerCase().endsWith('.webm')
      ? 'video/webm'
      : 'video/mp4'

console.error(
  `Uploading ${path.basename(VIDEO_PATH)} (${(stats.size / 1024 / 1024).toFixed(1)} MB) to Gemini Files API…`,
)

/* ── Step 1: start resumable upload session ──────────────────────────── */

const startRes = await fetch(
  `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`,
  {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(stats.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: { display_name: path.basename(VIDEO_PATH) },
    }),
  },
)

if (!startRes.ok) {
  const text = await startRes.text()
  throw new Error(`upload start failed: ${startRes.status} ${text}`)
}

const uploadUrl = startRes.headers.get('x-goog-upload-url')
if (!uploadUrl) throw new Error('no upload URL from Gemini')

/* ── Step 2: upload bytes in one request (file is small enough) ──────── */

const fileStream = createReadStream(VIDEO_PATH)
const finalizeRes = await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    'Content-Length': String(stats.size),
    'X-Goog-Upload-Offset': '0',
    'X-Goog-Upload-Command': 'upload, finalize',
  },
  body: fileStream,
  duplex: 'half',
})

if (!finalizeRes.ok) {
  const text = await finalizeRes.text()
  throw new Error(`upload finalize failed: ${finalizeRes.status} ${text}`)
}

const fileMeta = await finalizeRes.json()
const fileName = fileMeta.file?.name
const fileUri = fileMeta.file?.uri
if (!fileName || !fileUri) {
  throw new Error(`upload returned no file uri: ${JSON.stringify(fileMeta)}`)
}

console.error(`Uploaded as ${fileName} — polling state…`)

/* ── Step 3: poll until ACTIVE ───────────────────────────────────────── */

let state = fileMeta.file?.state ?? 'PROCESSING'
let polls = 0
while (state !== 'ACTIVE') {
  if (state === 'FAILED') throw new Error('file processing FAILED')
  if (++polls > 60) throw new Error('file processing timeout (>5 min)')
  await new Promise((r) => setTimeout(r, 5000))
  const statusRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${API_KEY}`,
  )
  if (!statusRes.ok) throw new Error(`status check failed: ${statusRes.status}`)
  const status = await statusRes.json()
  state = status.state ?? 'PROCESSING'
  process.stderr.write(`.`)
}
process.stderr.write('\n')
console.error('File ACTIVE — calling generateContent…')

/* ── Step 4: structured analysis prompt ──────────────────────────────── */

const analysisPrompt = `
You are reviewing a Loom video sent by Damien, our CMF designer at Loop
Earplugs. Damien is reviewing a generated PDF that our CMF flow produces.
He is comparing it to his reference PDF and giving feedback. The video
contains both his screen (showing the two PDFs side-by-side) and his
voice-over.

Loop's CMF flow already builds, per SKU, a 2-page deck:
  • Page 1 — CMF spec (product render + per-component spec list:
              material / finish / colour / artwork)
  • Page 2 — Part Break Down (one cell per component: name, swatch,
              Pantone, material, finish, technique)
There is also an optional intermediate "Clown reference" page (the
multi-coloured render used as the model input) with a colour legend
keyed to each component.

Damien's likely vocabulary:
  • "Pom ring" / "Pomering" — POM retention ring
  • "Cosmetic cap" — the visible front cap of the earplug
  • "Nozzle piece" / "retention ring" — the inner piece (usually red)
  • "Ear tips" / "spirit tips" — silicone tips (sometimes "pink")
  • "Clown" — the colour-coded reference render
  • "Click-down version" / "click on version" — the click-on accessory
    variant

Watch the entire video and transcribe what matters. Then output the
analysis as well-formed Markdown with these exact top-level sections:

## 1. One-paragraph TL;DR
Plain English. What is Damien's overall verdict and what is the single
biggest change he is asking for?

## 2. Structured findings
A table with columns: Timestamp · Surface · What Damien said · What he
wants · Severity (blocker / important / nice-to-have).
"Surface" should be one of: Page 1 spec, Clown reference, Part Break
Down, Pack overview, Cross-page, Other.

## 3. Colour legend mapping he wants
A bullet list of component → colour pairings he explicitly names
(e.g. "POM ring → green"). Mark any he leaves ambiguous.

## 4. Page-structure asks
What does he want collapsed onto one page vs. split? Quote him directly
where useful.

## 5. Things he is happy with
Don't lose these — they are what we should NOT regress.

## 6. Open questions / ambiguities
Anything where his intent is unclear and we would need to ask back.

## 7. Suggested action list
Ordered (most important first). Each item is concrete enough to feed
into a code task: which file/area in our CMF flow is affected, what
the desired behaviour is. Use Loop's terminology, not generic UX talk.

Be specific. Quote phrases when they are diagnostic. Use mm:ss
timestamps from the video. Do not invent details that aren't in the
video — if something is unclear, put it under Open questions.
`

const genRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { fileData: { mimeType, fileUri } },
            { text: analysisPrompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    }),
  },
)

if (!genRes.ok) {
  const text = await genRes.text()
  throw new Error(`generateContent failed: ${genRes.status} ${text}`)
}

const data = await genRes.json()
const text = data.candidates?.[0]?.content?.parts
  ?.map((p) => p.text || '')
  .join('')
if (!text) throw new Error(`empty response: ${JSON.stringify(data).slice(0, 400)}`)

console.log(text)

if (OUT_PATH) {
  await writeFile(OUT_PATH, text, 'utf8')
  console.error(`\nWrote analysis to ${OUT_PATH}`)
}

/* ── Step 5: optional cleanup ────────────────────────────────────────── */

await fetch(
  `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${API_KEY}`,
  { method: 'DELETE' },
).catch(() => {})
