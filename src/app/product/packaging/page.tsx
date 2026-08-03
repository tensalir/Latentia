import { Suspense } from 'react'
import { PackagingWorkspace } from '@/components/packaging/PackagingWorkspace'

export const metadata = {
  title: 'Packaging Studio · Vesper',
}

/**
 * `?project=&packet=&component=` make the workspace deep-linkable — the
 * engineer gets sent straight to the component page they own.
 */
export default function PackagingPage({
  searchParams,
}: {
  searchParams: { project?: string; packet?: string; component?: string }
}) {
  return (
    <Suspense fallback={null}>
      <PackagingWorkspace
        initialProjectId={searchParams.project ?? null}
        initialPacketId={searchParams.packet ?? null}
        initialComponentId={searchParams.component ?? null}
      />
    </Suspense>
  )
}
