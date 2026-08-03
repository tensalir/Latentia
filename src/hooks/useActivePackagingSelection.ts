'use client'

/**
 * Owns "what is the packaging workspace looking at?" — project, packet and
 * component — mirrored to the URL (`?project=&packet=&component=`) so refresh,
 * shared links and back/forward all land on the same place.
 *
 * Generalised from `useActivePacket.ts` (CMF) which tracks a single id. The
 * three ids are hierarchical: changing the project clears the packet and
 * component, changing the packet clears the component.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export interface PackagingSelection {
  projectId: string | null
  packetId: string | null
  componentId: string | null
}

export interface UseActivePackagingSelectionResult extends PackagingSelection {
  selectProject: (id: string | null) => void
  selectPacket: (id: string | null) => void
  selectComponent: (id: string | null) => void
}

export function useActivePackagingSelection(
  initial: PackagingSelection
): UseActivePackagingSelectionResult {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selection, setSelection] = useState<PackagingSelection>(initial)

  const push = useCallback(
    (next: PackagingSelection) => {
      setSelection(next)
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      for (const [key, value] of [
        ['project', next.projectId],
        ['packet', next.packetId],
        ['component', next.componentId],
      ] as const) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      const query = params.toString()
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const selectProject = useCallback(
    (id: string | null) => push({ projectId: id, packetId: null, componentId: null }),
    [push]
  )

  const selectPacket = useCallback(
    (id: string | null) =>
      push({ projectId: selection.projectId, packetId: id, componentId: null }),
    [push, selection.projectId]
  )

  const selectComponent = useCallback(
    (id: string | null) =>
      push({ projectId: selection.projectId, packetId: selection.packetId, componentId: id }),
    [push, selection.packetId, selection.projectId]
  )

  // Adopt URL-driven changes (back/forward, pasted deep link) without writing
  // back to the URL and looping. Compare against a ref of what we last pushed.
  const lastPushed = useRef(initial)
  useEffect(() => {
    lastPushed.current = selection
  }, [selection])

  useEffect(() => {
    const external =
      initial.projectId !== lastPushed.current.projectId ||
      initial.packetId !== lastPushed.current.packetId ||
      initial.componentId !== lastPushed.current.componentId
    if (external) setSelection(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.projectId, initial.packetId, initial.componentId])

  return { ...selection, selectProject, selectPacket, selectComponent }
}
