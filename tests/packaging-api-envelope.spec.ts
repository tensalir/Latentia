import { test, expect } from '@playwright/test'
import { packagingError, translateAccessError } from '../src/lib/packaging/api'
import {
  PackagingForbiddenError,
  PackagingNotFoundError,
  profileCanWritePackaging,
} from '../src/lib/packaging/service'
import {
  APPROVAL_STATUSES,
  componentPatchSchema,
  componentTypeCreateSchema,
  packetCreateSchema,
  projectCreateSchema,
  signedUploadRequestSchema,
  stepsPutSchema,
  zodDetails,
} from '../src/lib/packaging/schema'

/**
 * The error envelope and the request schemas are the contract the client hook
 * relies on. Mirrors `tests/cmf-api-error-envelope.spec.ts`.
 */

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

test('packagingError defaults to 400 with just an error field', async () => {
  const response = packagingError('Something is off')
  expect(response.status).toBe(400)
  expect(await bodyOf(response)).toEqual({ error: 'Something is off' })
})

test('packagingError carries status, details, category and extras', async () => {
  const response = packagingError('Invalid request body', {
    status: 422,
    details: [{ path: 'components.0.material', message: 'Too long' }],
    category: 'validation',
    extra: { hint: 'Download a fresh workbook' },
  })
  expect(response.status).toBe(422)
  expect(await bodyOf(response)).toEqual({
    error: 'Invalid request body',
    details: [{ path: 'components.0.material', message: 'Too long' }],
    category: 'validation',
    hint: 'Download a fresh workbook',
  })
})

test('empty details are omitted rather than sent as an empty array', async () => {
  const response = packagingError('Nope', { details: [] })
  expect(await bodyOf(response)).toEqual({ error: 'Nope' })
})

test('translateAccessError maps the packaging error classes', async () => {
  const notFound = translateAccessError(new PackagingNotFoundError('Packet not found'))
  expect(notFound?.status).toBe(404)
  expect(await bodyOf(notFound!)).toEqual({ error: 'Packet not found' })

  const forbidden = translateAccessError(new PackagingForbiddenError('Requires owner'))
  expect(forbidden?.status).toBe(403)
})

test('translateAccessError returns null for anything else so callers rethrow', () => {
  expect(translateAccessError(new Error('database exploded'))).toBeNull()
  expect(translateAccessError('a string')).toBeNull()
})

test('write access: admins always, otherwise the packagingAccess flag', () => {
  expect(profileCanWritePackaging({ role: 'admin', packagingAccess: false })).toBe(true)
  expect(profileCanWritePackaging({ role: 'user', packagingAccess: true })).toBe(true)
  expect(profileCanWritePackaging({ role: 'user', packagingAccess: false })).toBe(false)
  expect(profileCanWritePackaging(null)).toBe(false)
  expect(profileCanWritePackaging(undefined)).toBe(false)
})

// ── Schemas ─────────────────────────────────────────────────────────────────

test('the component patch schema rejects machine-owned fields', () => {
  // These come from the .ai; accepting them would let a client overwrite the
  // synced truth and silently disagree with the artwork.
  for (const field of ['inks', 'finishes', 'structuralPlates', 'printPartNumber']) {
    const parsed = componentPatchSchema.safeParse({ [field]: ['made up'] })
    expect(parsed.success, `${field} should not be accepted`).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data), `${field} must be stripped`).not.toContain(field)
    }
  }
})

test('the component patch schema accepts the human fields', () => {
  const parsed = componentPatchSchema.safeParse({
    material: '450gr Simwhite Paper',
    printingMethod: 'Offset',
    coatingMsdsRef: 'Water Based Coating',
    paperThickness: '450 gsm',
    drawingPartNumber: '510-123456',
    approvalStatus: 'Approved',
    engineerNotes: 'Keep the top-right clear.',
    includeInCreativeIntent: false,
    pageOrder: 3,
  })
  expect(parsed.success).toBe(true)
})

test('blank strings normalise to null so a cleared field really clears', () => {
  const parsed = componentPatchSchema.safeParse({ material: '   ' })
  expect(parsed.success).toBe(true)
  if (parsed.success) expect(parsed.data.material).toBeNull()
})

test('an unknown approval status is rejected', () => {
  expect(componentPatchSchema.safeParse({ approvalStatus: 'Whatever' }).success).toBe(false)
  for (const status of APPROVAL_STATUSES) {
    expect(componentPatchSchema.safeParse({ approvalStatus: status }).success).toBe(true)
  }
})

test('packet creation requires a known stage', () => {
  const ok = packetCreateSchema.safeParse({
    projectId: '11111111-1111-4111-8111-111111111111',
    stage: 'EVT',
    variant: 'Black',
  })
  expect(ok.success).toBe(true)

  const bad = packetCreateSchema.safeParse({
    projectId: '11111111-1111-4111-8111-111111111111',
    stage: 'PROTO',
    variant: 'Black',
  })
  expect(bad.success).toBe(false)
})

test('variant defaults to Default so the unique index always holds', () => {
  const parsed = packetCreateSchema.safeParse({
    projectId: '11111111-1111-4111-8111-111111111111',
    stage: 'MP',
  })
  expect(parsed.success).toBe(true)
  if (parsed.success) expect(parsed.data.variant).toBe('Default')
})

test('a project needs a name', () => {
  expect(projectCreateSchema.safeParse({}).success).toBe(false)
  expect(projectCreateSchema.safeParse({ name: 'Aphrodite' }).success).toBe(true)
})

test('a catalogue slug must be Tab_Name_Form', () => {
  const valid = ['Rigid_Box_Lid', 'Hangtag', 'Pulp_Tray', 'Component2']
  for (const slug of valid) {
    expect(
      componentTypeCreateSchema.safeParse({ slug, displayName: 'x' }).success,
      slug
    ).toBe(true)
  }
  const invalid = ['rigid box lid', 'Rigid__Box', '_Leading', 'Trailing_', 'Has-Dash']
  for (const slug of invalid) {
    expect(
      componentTypeCreateSchema.safeParse({ slug, displayName: 'x' }).success,
      slug
    ).toBe(false)
  }
})

test('step_image is a valid upload kind but not a registrable artwork kind', () => {
  // Step images belong to a step row, not to the artwork table.
  expect(
    signedUploadRequestSchema.safeParse({ kind: 'step_image', fileName: 's.png' }).success
  ).toBe(true)
  expect(
    signedUploadRequestSchema.safeParse({ kind: 'nonsense', fileName: 's.png' }).success
  ).toBe(false)
})

test('pack steps require instruction text and cap the list', () => {
  expect(stepsPutSchema.safeParse({ steps: [] }).success).toBe(true)
  expect(stepsPutSchema.safeParse({ steps: [{ instruction: '' }] }).success).toBe(false)
  expect(
    stepsPutSchema.safeParse({
      steps: Array.from({ length: 21 }, () => ({ instruction: 'x' })),
    }).success
  ).toBe(false)
})

test('zodDetails flattens issues into the envelope shape', () => {
  const parsed = componentPatchSchema.safeParse({ pageOrder: -5 })
  expect(parsed.success).toBe(false)
  if (!parsed.success) {
    const details = zodDetails(parsed.error)
    expect(details[0]).toHaveProperty('path', 'pageOrder')
    expect(typeof details[0].message).toBe('string')
  }
})
