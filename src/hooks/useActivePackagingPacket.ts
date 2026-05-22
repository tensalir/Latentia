'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function useActivePackagingPacket(initialPacketId: string | null) {
  const router = useRouter()
  const search = useSearchParams()
  const urlPacket = search?.get('packet') ?? null
  const [activePacketId, setActivePacketIdState] = useState<string | null>(
    urlPacket || initialPacketId
  )

  useEffect(() => {
    if (urlPacket && urlPacket !== activePacketId) {
      setActivePacketIdState(urlPacket)
    }
  }, [urlPacket, activePacketId])

  const setActivePacketId = useCallback(
    (id: string | null) => {
      setActivePacketIdState(id)
      const params = new URLSearchParams(search?.toString() ?? '')
      if (id) params.set('packet', id)
      else params.delete('packet')
      const q = params.toString()
      router.replace(q ? `/product/packaging?${q}` : '/product/packaging', { scroll: false })
    },
    [router, search]
  )

  return { activePacketId, setActivePacketId }
}
