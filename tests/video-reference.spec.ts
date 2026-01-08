import { test, expect } from '@playwright/test'
import { persistReferenceImage, downloadReferenceImageAsDataUrl } from '../src/lib/reference-images'

const SAMPLE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YpukpoAAAAASUVORK5CYII='
const SAMPLE_DATA_URL = `data:image/png;base64,${SAMPLE_BASE64}`

test.describe('Veo reference image plumbing', () => {
  test('persists pointer metadata and hydrates inline data', async () => {
    const uploads: { bucket?: string; path?: string } = {}

    const pointer = await persistReferenceImage(
      SAMPLE_DATA_URL,
      'user-test',
      'ref-playwright',
      async (dataUrl, bucket, path) => {
        // Ensure the helper receives the original data URL
        expect(dataUrl.startsWith('data:image/png;base64,')).toBeTruthy()
        uploads.bucket = bucket
        uploads.path = path
        return `https://storage.local/${path}`
      }
    )

    expect(pointer.referenceImageId).toBe('ref-playwright')
    expect(uploads.bucket).toBe('generated-images')
    expect(pointer.referenceImagePath).toBe(uploads.path)
    expect(pointer.referenceImageUrl).toBe(`https://storage.local/${uploads.path}`)
    expect(pointer.referenceImageMimeType).toBe('image/png')
    expect(pointer.referenceImageChecksum).toHaveLength(64)

    const mockedFetch: typeof fetch = async (url) => {
      expect(url).toBe(pointer.referenceImageUrl)
      return new Response(Buffer.from(SAMPLE_BASE64, 'base64'), {
        status: 200,
        headers: {
          'Content-Type': pointer.referenceImageMimeType,
        },
      })
    }

    const hydrated = await downloadReferenceImageAsDataUrl(
      pointer.referenceImageUrl,
      pointer.referenceImageMimeType,
      mockedFetch
    )

    expect(hydrated.startsWith('data:image/png;base64,')).toBeTruthy()
    expect(hydrated.split(',')[1]).toBe(SAMPLE_BASE64)
  })
})

