/**
 * Direct browser → Supabase uploads for large Illustrator files.
 */

import { createClient } from '@supabase/supabase-js'
import { PACKAGING_STORAGE_BUCKET } from './storage'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export interface SignedUploadResult {
  path: string
  token: string
  signedUrl: string
}

export async function createPackagingSignedUpload(args: {
  path: string
  expiresInSeconds?: number
}): Promise<SignedUploadResult> {
  const { data, error } = await supabaseAdmin.storage
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
  const { data, error } = await supabaseAdmin.storage.from(PACKAGING_STORAGE_BUCKET).download(path)
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
  const { error } = await supabaseAdmin.storage
    .from(PACKAGING_STORAGE_BUCKET)
    .upload(args.path, args.buffer, {
      contentType: args.contentType,
      upsert: true,
    })
  if (error) throw new Error(`Upload failed: ${error.message}`)
}

export function getPackagingSignedDownloadUrl(path: string, expiresIn = 3600): Promise<string> {
  return supabaseAdmin.storage
    .from(PACKAGING_STORAGE_BUCKET)
    .createSignedUrl(path, expiresIn)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'signed url failed')
      return data.signedUrl
    })
}
