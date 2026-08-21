import { test, expect } from '@playwright/test'
import {
  buildSeedanceInput,
  normalizeSeedanceDuration,
  normalizeSeedanceResolution,
  seedanceUsesVideoInput,
  REPLICATE_MODEL_CONFIGS,
  SEEDANCE_2_5_MODEL_PATH,
  SEEDANCE_MAX_REFERENCE_AUDIOS,
  SEEDANCE_MAX_REFERENCE_IMAGES,
  SEEDANCE_MAX_REFERENCE_VIDEOS,
  supportsWebhook,
} from '../src/lib/models/replicate-utils'
import { HeadlessGenerateVideoSchema } from '../src/lib/api/validation'
import { calculateGenerationCost, calculateSeedanceCost } from '../src/lib/cost/calculator'
import { getModelConfig, getModelsByType } from '../src/lib/models/registry'
import { VIDEO_MODEL_IDS } from '../src/lib/headless/model-allowlists'

/**
 * Contract tests for Seedance 2.5 (bytedance/seedance-2.5 on Replicate).
 *
 * These pin the model's genuinely strict input rules, verified against the
 * live OpenAPI schema on 2026-08-21:
 *
 *   - resolution is 480p / 720p only (no 1080p tier)
 *   - duration is 4-30s, or -1 for model-chosen length
 *   - `last_frame_image` requires `image`, and that mode only accepts
 *     `aspect_ratio: 'adaptive'`
 *   - reference images/videos/audios cannot be combined with first/last frame
 *
 * Billing is per second of OUTPUT video (official Replicate model), not by
 * compute time — getting that wrong silently under-reports spend.
 */

const MODEL_ID = 'replicate-seedance-2.5'

test.describe('Seedance 2.5 registration', () => {
  test('is registered as a video model', () => {
    const config = getModelConfig(MODEL_ID)
    expect(config).not.toBeNull()
    expect(config?.type).toBe('video')
    expect(config?.name).toBe('Seedance 2.5')
    expect(getModelsByType('video').map((m) => m.id)).toContain(MODEL_ID)
  })

  test('advertises audio and first/last frame support, capped at 720p', () => {
    const config = getModelConfig(MODEL_ID)!
    expect(config.capabilities?.['text-2-video']).toBe(true)
    expect(config.capabilities?.['image-2-video']).toBe(true)
    expect(config.capabilities?.['frame-interpolation']).toBe(true)
    expect(config.capabilities?.audioGeneration).toBe(true)
    expect(config.maxResolution).toBe(720)
  })

  test('only exposes durations and resolutions the API accepts', () => {
    const config = getModelConfig(MODEL_ID)!
    const resolutions = config.parameters?.find((p) => p.name === 'resolution')?.options ?? []
    expect(resolutions.map((o) => o.value)).toEqual([480, 720])

    const durations = config.parameters?.find((p) => p.name === 'duration')?.options ?? []
    for (const option of durations) {
      expect(option.value).toBeGreaterThanOrEqual(4)
      expect(option.value).toBeLessThanOrEqual(30)
    }
    expect(durations.map((o) => o.value)).toContain(30)
  })

  test('is reachable via the webhook path and the MCP video allowlist', () => {
    expect(supportsWebhook(MODEL_ID)).toBe(true)
    expect(REPLICATE_MODEL_CONFIGS[MODEL_ID].modelPath).toBe(SEEDANCE_2_5_MODEL_PATH)
    expect(SEEDANCE_2_5_MODEL_PATH).toBe('bytedance/seedance-2.5')
    expect([...VIDEO_MODEL_IDS]).toContain(MODEL_ID)
  })
})

test.describe('Seedance 2.5 input building', () => {
  test('text-to-video sends no image fields and keeps the chosen ratio', () => {
    const input = buildSeedanceInput({ prompt: 'a kite over the sea', aspectRatio: '21:9' })

    expect(input.prompt).toBe('a kite over the sea')
    expect(input.aspect_ratio).toBe('21:9')
    expect(input.duration).toBe(5)
    expect(input.resolution).toBe('720p')
    expect(input.generate_audio).toBe(true)
    expect(input.output_format).toBe('mp4')
    expect(input.image).toBeUndefined()
    expect(input.last_frame_image).toBeUndefined()
  })

  test('a start frame maps to `image`, not Kling\'s `start_image`', () => {
    const input = buildSeedanceInput({
      prompt: 'zoom out',
      referenceImageUrl: 'https://example.com/start.png',
      aspectRatio: '9:16',
    })

    expect(input.image).toBe('https://example.com/start.png')
    expect(input.start_image).toBeUndefined()
    // Start-frame-only mode keeps the requested ratio.
    expect(input.aspect_ratio).toBe('9:16')
  })

  test('first/last-frame mode forces the adaptive aspect ratio', () => {
    const input = buildSeedanceInput({
      prompt: 'morph',
      referenceImages: ['https://example.com/first.png'],
      endFrameImageUrl: 'https://example.com/last.png',
      aspectRatio: '16:9',
    })

    expect(input.image).toBe('https://example.com/first.png')
    expect(input.last_frame_image).toBe('https://example.com/last.png')
    expect(input.aspect_ratio).toBe('adaptive')
  })

  test('an end frame without a start frame is dropped', () => {
    // The API rejects `last_frame_image` without `image`.
    const input = buildSeedanceInput({
      prompt: 'orphan end frame',
      endFrameImageUrl: 'https://example.com/last.png',
    })

    expect(input.image).toBeUndefined()
    expect(input.last_frame_image).toBeUndefined()
    expect(input.aspect_ratio).toBe('16:9')
  })

  test('the webhook builder and the shared builder agree', () => {
    const params = {
      prompt: 'same input both ways',
      referenceImage: 'https://example.com/first.png',
      endFrameImageUrl: 'https://example.com/last.png',
      duration: 30,
      resolution: 480,
    }

    expect(REPLICATE_MODEL_CONFIGS[MODEL_ID].buildInput(params)).toEqual(buildSeedanceInput(params))
  })

  test('normalizes resolution to the two supported tiers', () => {
    expect(normalizeSeedanceResolution(480)).toBe('480p')
    expect(normalizeSeedanceResolution(720)).toBe('720p')
    expect(normalizeSeedanceResolution('480p')).toBe('480p')
    // A stale 1080p setting from another video model must clamp, not leak.
    expect(normalizeSeedanceResolution(1080)).toBe('720p')
    expect(normalizeSeedanceResolution(undefined)).toBe('720p')
  })

  test('clamps duration into range and preserves auto (-1)', () => {
    expect(normalizeSeedanceDuration(30)).toBe(30)
    expect(normalizeSeedanceDuration(45)).toBe(30)
    expect(normalizeSeedanceDuration(1)).toBe(4)
    expect(normalizeSeedanceDuration(-1)).toBe(-1)
    expect(normalizeSeedanceDuration(undefined)).toBe(5)
  })

  test('audio is on by default and can be turned off explicitly', () => {
    expect(buildSeedanceInput({ prompt: 'x' }).generate_audio).toBe(true)
    expect(buildSeedanceInput({ prompt: 'x', generateAudio: false }).generate_audio).toBe(false)
  })
})

test.describe('Seedance 2.5 pricing', () => {
  // Rates from the model's billing tiers, per second of output video.
  test('prices per second of output video by resolution tier', () => {
    expect(calculateSeedanceCost(10, { resolution: 720 }).cost).toBeCloseTo(2.312, 6)
    expect(calculateSeedanceCost(10, { resolution: 480 }).cost).toBeCloseTo(1.028, 6)
    expect(calculateSeedanceCost(5, { resolution: 720, hasVideoInput: true }).cost).toBeCloseTo(4.838, 6)
  })

  test('routes through calculateGenerationCost and ignores compute time', () => {
    const result = calculateGenerationCost(MODEL_ID, {
      videoDurationSeconds: 30,
      resolution: 720,
      // A compute-time value must not be used for this official model.
      computeTimeSeconds: 180,
    })

    expect(result.cost).toBeCloseTo(6.936, 6)
    expect(result.isActual).toBe(true)
  })

  test('never bills zero or negative for a missing duration', () => {
    for (const duration of [undefined, 0, -1, Number.NaN]) {
      const result = calculateSeedanceCost(duration as number | undefined, { resolution: 720 })
      expect(result.cost).toBeGreaterThan(0)
      expect(result.isActual).toBe(false)
    }
  })
})

test.describe('Seedance 2.5 reference sets', () => {
  const IMG = (n: number) => `https://example.com/ref-${n}.png`
  const VID = (n: number) => `https://example.com/ref-${n}.mp4`
  const AUD = (n: number) => `https://example.com/ref-${n}.mp3`

  test('advertises the reference-set caps and the frame exclusivity', () => {
    const caps = getModelConfig(MODEL_ID)!.capabilities!
    expect(caps.maxReferenceImages).toBe(SEEDANCE_MAX_REFERENCE_IMAGES)
    expect(caps.maxReferenceVideos).toBe(SEEDANCE_MAX_REFERENCE_VIDEOS)
    expect(caps.maxReferenceAudios).toBe(SEEDANCE_MAX_REFERENCE_AUDIOS)
    expect(caps.referenceSetsExcludeFrames).toBe(true)
    // 30 + 10 + 10 = the documented 50-file ceiling.
    expect(
      SEEDANCE_MAX_REFERENCE_IMAGES + SEEDANCE_MAX_REFERENCE_VIDEOS + SEEDANCE_MAX_REFERENCE_AUDIOS
    ).toBe(50)
  })

  test('sends reference sets under the API field names', () => {
    const input = buildSeedanceInput({
      prompt: 'consistent character',
      referenceImageUrls: [IMG(1), IMG(2)],
      referenceVideoUrls: [VID(1)],
      referenceAudioUrls: [AUD(1)],
    })

    expect(input.reference_images).toEqual([IMG(1), IMG(2)])
    expect(input.reference_videos).toEqual([VID(1)])
    expect(input.reference_audios).toEqual([AUD(1)])
  })

  test('reference sets win over start/end frames, which the API forbids combining', () => {
    const input = buildSeedanceInput({
      prompt: 'both supplied',
      referenceImageUrl: 'https://example.com/start.png',
      endFrameImageUrl: 'https://example.com/last.png',
      referenceImageUrls: [IMG(1)],
    })

    expect(input.reference_images).toEqual([IMG(1)])
    expect(input.image).toBeUndefined()
    expect(input.last_frame_image).toBeUndefined()
    // Adaptive is only forced by first/last-frame mode, which we are not in.
    expect(input.aspect_ratio).toBe('16:9')
  })

  test('the start-frame keys keep their old meaning and do not leak into the set', () => {
    // `referenceImages` is this app's start-frame carrier, NOT a reference set.
    const input = buildSeedanceInput({
      prompt: 'start frame only',
      referenceImages: ['https://example.com/start.png'],
    })

    expect(input.image).toBe('https://example.com/start.png')
    expect(input.reference_images).toBeUndefined()
  })

  test('audio is dropped without a reference image or video', () => {
    const orphan = buildSeedanceInput({ prompt: 'x', referenceAudioUrls: [AUD(1)] })
    expect(orphan.reference_audios).toBeUndefined()
    expect(orphan.reference_images).toBeUndefined()

    const paired = buildSeedanceInput({
      prompt: 'x',
      referenceImageUrls: [IMG(1)],
      referenceAudioUrls: [AUD(1)],
    })
    expect(paired.reference_audios).toEqual([AUD(1)])
  })

  test('caps each reference list at the API limit', () => {
    const input = buildSeedanceInput({
      prompt: 'too many',
      referenceImageUrls: Array.from({ length: 40 }, (_, i) => IMG(i)),
      referenceVideoUrls: Array.from({ length: 15 }, (_, i) => VID(i)),
      referenceAudioUrls: Array.from({ length: 15 }, (_, i) => AUD(i)),
    })

    expect(input.reference_images).toHaveLength(SEEDANCE_MAX_REFERENCE_IMAGES)
    expect(input.reference_videos).toHaveLength(SEEDANCE_MAX_REFERENCE_VIDEOS)
    expect(input.reference_audios).toHaveLength(SEEDANCE_MAX_REFERENCE_AUDIOS)
  })

  test('ignores non-string and empty entries', () => {
    const input = buildSeedanceInput({
      prompt: 'x',
      referenceImageUrls: [IMG(1), '', null, undefined, 42, IMG(2)],
    })
    expect(input.reference_images).toEqual([IMG(1), IMG(2)])
  })

  test('reference videos flip the billing tier, images alone do not', () => {
    expect(seedanceUsesVideoInput({ referenceImageUrls: [IMG(1)] })).toBe(false)
    expect(seedanceUsesVideoInput({ referenceVideoUrls: [VID(1)] })).toBe(true)
    expect(seedanceUsesVideoInput(null)).toBe(false)

    const withVideo = calculateGenerationCost(MODEL_ID, {
      videoDurationSeconds: 5,
      resolution: 720,
      hasVideoInput: seedanceUsesVideoInput({ referenceVideoUrls: [VID(1)] }),
    })
    const withoutVideo = calculateGenerationCost(MODEL_ID, {
      videoDurationSeconds: 5,
      resolution: 720,
      hasVideoInput: seedanceUsesVideoInput({ referenceImageUrls: [IMG(1)] }),
    })

    expect(withVideo.cost).toBeCloseTo(4.838, 6)
    expect(withoutVideo.cost).toBeCloseTo(1.156, 6)
    expect(withVideo.cost).toBeGreaterThan(withoutVideo.cost * 3)
  })

  test('the webhook builder carries reference sets too', () => {
    const params = {
      prompt: 'via webhook',
      referenceImageUrls: [IMG(1)],
      referenceVideoUrls: [VID(1)],
      referenceAudioUrls: [AUD(1)],
      duration: 10,
      resolution: 480,
    }
    expect(REPLICATE_MODEL_CONFIGS[MODEL_ID].buildInput(params)).toEqual(buildSeedanceInput(params))
  })
})

test.describe('MCP video schema', () => {
  test('accepts a 30s duration now that Seedance can reach it', () => {
    const parsed = HeadlessGenerateVideoSchema.safeParse({
      prompt: 'thirty seconds',
      modelId: MODEL_ID,
      duration: 30,
    })
    expect(parsed.success).toBe(true)
  })

  test('accepts reference set URLs and rejects over-long lists', () => {
    const ok = HeadlessGenerateVideoSchema.safeParse({
      prompt: 'refs',
      modelId: MODEL_ID,
      referenceImageUrls: ['https://example.com/a.png'],
      referenceVideoUrls: ['https://example.com/a.mp4'],
      referenceAudioUrls: ['https://example.com/a.mp3'],
    })
    expect(ok.success).toBe(true)

    const tooMany = HeadlessGenerateVideoSchema.safeParse({
      prompt: 'refs',
      modelId: MODEL_ID,
      referenceVideoUrls: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}.mp4`),
    })
    expect(tooMany.success).toBe(false)
  })
})
