import { test, expect } from '@playwright/test'
import {
  buildSeedanceInput,
  normalizeSeedanceDuration,
  normalizeSeedanceResolution,
  REPLICATE_MODEL_CONFIGS,
  SEEDANCE_2_5_MODEL_PATH,
  supportsWebhook,
} from '../src/lib/models/replicate-utils'
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
