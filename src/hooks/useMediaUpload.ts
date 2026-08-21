'use client'

import { useState, useCallback } from 'react'

export type MediaKind = 'image' | 'video' | 'audio'

export interface UploadedMedia {
  url: string
  path: string
  bucket: string
  kind: MediaKind
  size: number
  mimeType: string
  /** Local preview URL (blob URL) for immediate display */
  previewUrl: string
  /** Duration in seconds for video/audio, null for images or when unreadable */
  durationSeconds: number | null
  /** Original file reference */
  file: File
}

export interface UseMediaUploadOptions {
  /** Purpose of the upload - affects the storage path */
  purpose?: string
}

export interface UseMediaUploadReturn {
  upload: (file: File) => Promise<UploadedMedia>
  uploadMultiple: (files: File[]) => Promise<UploadedMedia[]>
  isUploading: boolean
  progress: number
  error: string | null
  clearError: () => void
}

export function detectMediaKind(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return null
}

/**
 * Read the duration of a video or audio file in the browser.
 *
 * Seedance caps reference videos (and reference audios) at 30 seconds
 * combined, so we need the duration before upload to tell the user which
 * clip pushed them over rather than letting the API reject the whole job.
 *
 * Resolves to null rather than rejecting when the browser cannot decode the
 * file — a missing duration should not block an otherwise valid upload.
 */
export function readMediaDuration(file: File): Promise<number | null> {
  const kind = detectMediaKind(file)
  if (kind !== 'video' && kind !== 'audio') return Promise.resolve(null)

  return new Promise((resolve) => {
    const element = document.createElement(kind === 'video' ? 'video' : 'audio')
    const objectUrl = URL.createObjectURL(file)
    let settled = false

    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(objectUrl)
      resolve(value)
    }

    element.preload = 'metadata'
    element.onloadedmetadata = () => {
      const duration = element.duration
      finish(Number.isFinite(duration) && duration > 0 ? duration : null)
    }
    element.onerror = () => finish(null)
    // Don't hang the picker on a file the browser silently refuses to decode.
    setTimeout(() => finish(null), 10_000)

    element.src = objectUrl
  })
}

/**
 * Upload reference images, videos, or audio clips to storage.
 *
 * Sibling of `useImageUpload`, which stays image-only (and owns the
 * compression path) for the start/end frame flows. This hook backs Seedance's
 * multimodal reference sets: no compression, and it reports media duration so
 * the caller can enforce the provider's combined-length limit.
 */
export function useMediaUpload(options: UseMediaUploadOptions = {}): UseMediaUploadReturn {
  const { purpose = 'reference-set' } = options

  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const uploadOne = useCallback(async (file: File): Promise<UploadedMedia> => {
    const previewUrl = URL.createObjectURL(file)
    const durationSeconds = await readMediaDuration(file)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('purpose', purpose)

    const response = await fetch('/api/upload/reference-media', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Upload failed: ${response.status}`)
    }

    const data = await response.json()

    return {
      url: data.url,
      path: data.path,
      bucket: data.bucket,
      kind: data.kind,
      size: data.size,
      mimeType: data.mimeType,
      previewUrl,
      durationSeconds,
      file,
    }
  }, [purpose])

  const upload = useCallback(async (file: File): Promise<UploadedMedia> => {
    setIsUploading(true)
    setProgress(0)
    setError(null)

    try {
      const result = await uploadOne(file)
      setProgress(100)
      return result
    } catch (err: any) {
      const message = err.message || 'Upload failed'
      setError(message)
      throw new Error(message)
    } finally {
      setIsUploading(false)
    }
  }, [uploadOne])

  const uploadMultiple = useCallback(async (files: File[]): Promise<UploadedMedia[]> => {
    setIsUploading(true)
    setProgress(0)
    setError(null)

    try {
      const results: UploadedMedia[] = []
      for (let i = 0; i < files.length; i++) {
        results.push(await uploadOne(files[i]))
        setProgress(Math.round(((i + 1) / files.length) * 100))
      }
      return results
    } catch (err: any) {
      const message = err.message || 'Upload failed'
      setError(message)
      throw new Error(message)
    } finally {
      setIsUploading(false)
    }
  }, [uploadOne])

  return { upload, uploadMultiple, isUploading, progress, error, clearError }
}
