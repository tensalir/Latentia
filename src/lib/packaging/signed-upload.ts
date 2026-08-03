/**
 * Direct browser → Supabase uploads for large Illustrator files.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PACKAGING_STORAGE_BUCKET } from './storage'

/**
 * Lazily created so importing this module never depends on env being loaded
 * yet — scripts that pull in a helper before their dotenv side-effect fires
 * would otherwise blow up at import time with "supabaseUrl is required".
 */
let cachedAdmin: SupabaseClient | null = null

function admin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Packaging storage needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.'
    )
  }
  cachedAdmin = createClient(url, serviceKey)
  return cachedAdmin
}

export interface SignedUploadResult {
  path: string
  token: string
  signedUrl: string
}

export async function createPackagingSignedUpload(args: {
  path: string
  expiresInSeconds?: number
}): Promise<SignedUploadResult> {
  const { data, error } = await admin().storage
    .from(PACKAGING_STORAGE_BUCKET)
    .createSignedUploadUrl(args.path, {
      upsert: true,
    })

  if (error || !data) {
    throw new Error(`Signed upload failed: ${error?.message ?? 'unknown'}`)
  }

  return {
    path: args.path,
    token: data.token,
    signedUrl: data.signedUrl,
  }
}

export async function downloadPackagingFile(path: string): Promise<Buffer> {
  const { data, error } = await admin().storage.from(PACKAGING_STORAGE_BUCKET).download(path)
  if (error || !data) {
    throw new Error(`Download failed: ${error?.message ?? 'not found'}`)
  }
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}

export async function uploadPackagingBuffer(args: {
  path: string
  buffer: Buffer
  contentType: string
}): Promise<void> {
  const { error } = await admin().storage
    .from(PACKAGING_STORAGE_BUCKET)
    .upload(args.path, args.buffer, {
      contentType: args.contentType,
      upsert: true,
    })
  if (error) throw new Error(`Upload failed: ${error.message}`)
}

export async function deletePackagingFile(path: string): Promise<void> {
  const { error } = await admin().storage.from(PACKAGING_STORAGE_BUCKET).remove([path])
  if (error) throw new Error(`Delete failed: ${error.message}`)
}

export function getPackagingSignedDownloadUrl(path: string, expiresIn = 3600): Promise<string> {
  return admin().storage
    .from(PACKAGING_STORAGE_BUCKET)
    .createSignedUrl(path, expiresIn)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'signed url failed')
      return data.signedUrl
    })
}
