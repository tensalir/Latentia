import { test, expect } from '@playwright/test'
import {
  matchComponentSlug,
  parseArtworkName,
  stemOf,
  validateArtworkName,
} from '../src/lib/packaging/naming'

/**
 * The naming convention is load-bearing: the component token in a filename is
 * what the sync matches on, so a loose name means blank previews and missed
 * plates. These cases come from Anna's folder_naming_spec.md and from the real
 * Aphrodite EVT file set.
 */

const SLUGS = [
  'Rigid_Box_Lid',
  'Rigid_Box_Bottom',
  'Pulp_Tray',
  'Accessories_Insert',
  'Protection_Insert',
  'Compliance_Documentation',
  'User_Guide',
  'Hangtag',
  'Closure_Sticker',
]

test('stemOf strips the extension and any directory', () => {
  expect(stemOf('Pulp_Tray_Black_A120_Aphrodite_EVT_160726_ED.ai')).toBe(
    'Pulp_Tray_Black_A120_Aphrodite_EVT_160726_ED'
  )
  expect(stemOf('C:/x/y/Hangtag_Black.ai')).toBe('Hangtag_Black')
  expect(stemOf('no-extension')).toBe('no-extension')
})

test('matches the real Aphrodite EVT file set to the right components', () => {
  const cases: Array<[string, string]> = [
    ['Accessories_Insert_Black_A120_Aphrodite_EVT_160726_ED.ai', 'Accessories_Insert'],
    ['Compliance_Documentation_Black_A120_Aphrodite_EVT_160726_ED.ai', 'Compliance_Documentation'],
    ['Hangtag_Black_A120_Aphrodite_EVT_160726_ED.ai', 'Hangtag'],
    ['Protection_Insert_Black_A120_Aphrodite_EVT_160726_ED.ai', 'Protection_Insert'],
    ['Pulp_Tray_Black_A120_Aphrodite_EVT_160726_ED.ai', 'Pulp_Tray'],
    ['Rigid_Box_Bottom_Black_A120_Aphrodite_EVT_160726_ED.ai', 'Rigid_Box_Bottom'],
    // Double underscore = SKU-specific file. This is the case that would break
    // a naive startsWith.
    ['Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai', 'Rigid_Box_Lid'],
    ['User_Guide_Black_A120_Aphrodite_EVT_160726_ED.ai', 'User_Guide'],
  ]
  for (const [fileName, expected] of cases) {
    expect(matchComponentSlug(fileName, SLUGS), fileName).toBe(expected)
  }
})

test('longest prefix wins so Rigid_Box_Lid beats Rigid_Box', () => {
  const slugs = ['Rigid_Box', 'Rigid_Box_Lid']
  expect(matchComponentSlug('Rigid_Box_Lid_A120_EVT_160726_ED.ai', slugs)).toBe('Rigid_Box_Lid')
  expect(matchComponentSlug('Rigid_Box_A120_EVT_160726_ED.ai', slugs)).toBe('Rigid_Box')
})

test('adding the longer component to the catalogue flips the match', () => {
  // Anna's rule is "longest tab-name prefix wins", so a file for a component
  // the catalogue does not know yet resolves to the closest shorter name. That
  // is her documented behaviour, and the reason bulk folder scanning depends on
  // the components library being complete first.
  const file = 'Pulp_Tray_Liner_A120_Aphrodite_EVT_160726_ED.ai'
  expect(matchComponentSlug(file, ['Pulp_Tray'])).toBe('Pulp_Tray')
  expect(matchComponentSlug(file, ['Pulp_Tray', 'Pulp_Tray_Liner'])).toBe('Pulp_Tray_Liner')
})

test('the trailing token must start a new field, not extend the slug', () => {
  // `Pulp_Trayliner` is a different word, not `Pulp_Tray` plus a field.
  expect(matchComponentSlug('Pulp_Trayliner_A120_EVT_160726_ED.ai', ['Pulp_Tray'])).toBeNull()
})

test('an exact stem with no trailing fields still matches', () => {
  expect(matchComponentSlug('Hangtag.ai', SLUGS)).toBe('Hangtag')
})

test('an unknown component yields null rather than a wrong guess', () => {
  expect(matchComponentSlug('Mystery_Part_A120_EVT_160726_ED.ai', SLUGS)).toBeNull()
})

test('parses every token of the convention', () => {
  const parsed = parseArtworkName('Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai', SLUGS)
  expect(parsed).toMatchObject({
    component: 'Rigid_Box_Lid',
    variant: 'Black',
    ref: 'A120',
    product: 'Aphrodite',
    stage: 'EVT',
    dateToken: '160726',
    typeMarker: 'ED',
    extension: 'ai',
  })
})

test('a shared (non-SKU) file has no variant', () => {
  const parsed = parseArtworkName('Pulp_Tray_A120_Aphrodite_EVT_160726_ED.ai', SLUGS)
  expect(parsed.variant).toBeNull()
  expect(parsed.component).toBe('Pulp_Tray')
})

test('the outline export is distinguished from the editable master', () => {
  expect(parseArtworkName('Hangtag_A120_Aphrodite_EVT_160726_OL.pdf', SLUGS).typeMarker).toBe('OL')
  expect(parseArtworkName('Hangtag_A120_Aphrodite_EVT_160726_ED.ai', SLUGS).typeMarker).toBe('ED')
})

test('validation flags spaces, noise words and a missing date', () => {
  const spaces = validateArtworkName('Pulp Tray A120 EVT 160726 ED.ai', { expectedSlug: 'Pulp_Tray' })
  expect(spaces.valid).toBe(false)
  expect(spaces.problems.join(' ')).toContain('spaces')

  const noise = validateArtworkName('Pulp_Tray_A120_Aphrodite_EVT_160726_ED_final_v2.ai', {
    expectedSlug: 'Pulp_Tray',
    knownSlugs: SLUGS,
  })
  expect(noise.problems.join(' ')).toContain('noise words')

  const undated = validateArtworkName('Pulp_Tray_A120_Aphrodite_EVT_ED.ai', {
    expectedSlug: 'Pulp_Tray',
    knownSlugs: SLUGS,
  })
  expect(undated.problems.join(' ')).toContain('DDMMYY')
})

test('validation flags a filename whose component does not match the slot', () => {
  const wrong = validateArtworkName('Hangtag_A120_Aphrodite_EVT_160726_ED.ai', {
    expectedSlug: 'Pulp_Tray',
    knownSlugs: SLUGS,
  })
  expect(wrong.valid).toBe(false)
  expect(wrong.problems.join(' ')).toContain('Pulp_Tray')
})

test('validation flags a stage that disagrees with the packet', () => {
  const wrongStage = validateArtworkName('Pulp_Tray_A120_Aphrodite_DVT_160726_ED.ai', {
    expectedSlug: 'Pulp_Tray',
    knownSlugs: SLUGS,
    expectedStage: 'EVT',
  })
  expect(wrongStage.problems.join(' ')).toContain('DVT')
})

test('a correctly named file passes clean', () => {
  const ok = validateArtworkName('Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai', {
    expectedSlug: 'Rigid_Box_Lid',
    knownSlugs: SLUGS,
    expectedStage: 'EVT',
  })
  expect(ok.problems).toEqual([])
  expect(ok.valid).toBe(true)
})
