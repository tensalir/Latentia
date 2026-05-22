'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PackagingPacketWorkspace } from '@/components/packaging/PackagingPacketWorkspace'

export default function PackagingStudioPage() {
  return (
    <Suspense fallback={null}>
      <PackagingStudioPageInner />
    </Suspense>
  )
}

function PackagingStudioPageInner() {
  const search = useSearchParams()
  const packetId = search?.get('packet') ?? null
  return <PackagingPacketWorkspace initialPacketId={packetId} />
}
