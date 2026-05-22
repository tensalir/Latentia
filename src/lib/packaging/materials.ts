import { prisma } from '@/lib/prisma'
import type { ExtractedPlates } from './plates'

export type PackagingMaterialKind =
  | 'paper'
  | 'coating'
  | 'ink'
  | 'finish'
  | 'adhesive'
  | 'substrate'

export interface MaterialMatchResult {
  plateName: string
  matched: boolean
  materialId?: string
  materialCode?: string
}

function normaliseMatch(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, ' ')
}

export async function listApprovedMaterials(kind?: PackagingMaterialKind) {
  return prisma.packagingMaterial.findMany({
    where: {
      approvalStatus: 'approved',
      ...(kind ? { kind } : {}),
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })
}

export async function validatePlatesAgainstLibrary(
  plates: ExtractedPlates
): Promise<{ mismatches: MaterialMatchResult[]; mismatchedIds: string[] }> {
  const materials = await listApprovedMaterials()
  const byName = new Map<string, (typeof materials)[0]>()
  for (const m of materials) {
    byName.set(normaliseMatch(m.name), m)
    byName.set(normaliseMatch(m.code), m)
    const attrs = m.attributes as Record<string, unknown>
    if (typeof attrs.pantoneCode === 'string') {
      byName.set(normaliseMatch(attrs.pantoneCode), m)
    }
    if (typeof attrs.plateAlias === 'string') {
      byName.set(normaliseMatch(attrs.plateAlias as string), m)
    }
  }

  const allPlates = [...plates.inks, ...plates.finishes, ...plates.dielines]
  const mismatches: MaterialMatchResult[] = []
  const mismatchedIds: string[] = []

  for (const plateName of allPlates) {
    const key = normaliseMatch(plateName)
    const hit = byName.get(key)
    if (hit) {
      mismatches.push({
        plateName,
        matched: true,
        materialId: hit.id,
        materialCode: hit.code,
      })
    } else {
      mismatches.push({ plateName, matched: false })
      mismatchedIds.push(plateName)
    }
  }

  return { mismatches, mismatchedIds }
}

export function validateSpecMaterial(
  specValue: string | undefined,
  materials: Array<{ id: string; code: string; name: string }>
): string | null {
  if (!specValue?.trim()) return null
  const key = normaliseMatch(specValue)
  const hit = materials.find(
    (m) => normaliseMatch(m.name) === key || normaliseMatch(m.code) === key
  )
  return hit ? null : specValue
}
