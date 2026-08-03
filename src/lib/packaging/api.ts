/**
 * Shared HTTP plumbing for Packaging route handlers.
 *
 * Same contract as `src/lib/cmf/api.ts` (the canonical error envelope:
 * `{ error, details?, category?, ...extra }`) — re-exported under packaging
 * names so route files read naturally and the packaging error classes get
 * their own translator.
 */

import { NextResponse } from 'next/server'
import type { CmfErrorOptions } from '@/lib/cmf/api'
import { cmfError } from '@/lib/cmf/api'
import { PackagingForbiddenError, PackagingNotFoundError } from './service'

export type PackagingErrorOptions = CmfErrorOptions

export function packagingError(message: string, opts: PackagingErrorOptions = {}): NextResponse {
  return cmfError(message, opts)
}

/**
 * Map `PackagingNotFoundError` / `PackagingForbiddenError` to the standard
 * envelope; return `null` for anything else so the caller can rethrow.
 */
export function translateAccessError(err: unknown): NextResponse | null {
  if (err instanceof PackagingNotFoundError) {
    return packagingError(err.message, { status: 404 })
  }
  if (err instanceof PackagingForbiddenError) {
    return packagingError(err.message, { status: 403 })
  }
  return null
}
