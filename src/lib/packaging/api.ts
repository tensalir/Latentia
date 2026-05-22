import { NextResponse } from 'next/server'
import { PackagingForbiddenError, PackagingNotFoundError } from './service'

export function packagingError(err: unknown): NextResponse {
  if (err instanceof PackagingNotFoundError) {
    return NextResponse.json({ error: 'not_found', message: err.message }, { status: 404 })
  }
  if (err instanceof PackagingForbiddenError) {
    return NextResponse.json({ error: 'forbidden', message: err.message }, { status: 403 })
  }
  if (err instanceof Error) {
    console.error('[packaging]', err)
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500 })
  }
  return NextResponse.json({ error: 'server_error' }, { status: 500 })
}

export function translateAccessError(err: unknown): NextResponse | null {
  if (err instanceof PackagingNotFoundError) {
    return NextResponse.json({ error: 'not_found', message: err.message }, { status: 404 })
  }
  if (err instanceof PackagingForbiddenError) {
    return NextResponse.json({ error: 'forbidden', message: err.message }, { status: 403 })
  }
  return null
}
