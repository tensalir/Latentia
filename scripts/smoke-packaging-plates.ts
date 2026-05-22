/**
 * Smoke test: extract plates from Nyx_MP_Closure_Sticker (smallest .ai in archive).
 * npx tsx scripts/smoke-packaging-plates.ts
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { extractPlates } from '../src/lib/packaging/plates'

const path = join(
  process.cwd(),
  'tmp',
  'packaging-intake',
  'archive',
  'Nyx_MP_Closure_Sticker_editable.ai'
)

async function main() {
  if (!existsSync(path)) {
    console.error('Missing', path, '— extract Archive.zip to tmp/packaging-intake/archive/')
    process.exit(1)
  }
  const buf = readFileSync(path)
  console.log('File size KB:', Math.round(buf.length / 1024))
  const plates = await extractPlates(buf)
  console.log(JSON.stringify(plates, null, 2))
  if (plates.raw.length === 0) {
    console.warn('No plates found — check XMP in file')
    process.exit(1)
  }
  console.log('OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
