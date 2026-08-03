'use client'

import { cn } from '@/lib/utils'
import type { PackagingComponent } from '@/hooks/usePackaging'

/**
 * Screen 5 navigation: one page per selected component. Each stakeholder opens
 * the part they own and fills their fields.
 */
export function ComponentPager({
  components,
  activeComponentId,
  onSelect,
}: {
  components: PackagingComponent[]
  activeComponentId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {components.map((component, index) => {
        const isActive = component.id === activeComponentId
        const hasArtwork = component.artworks.some((a) => a.kind === 'editable_ai')
        return (
          <button
            key={component.id}
            type="button"
            onClick={() => onSelect(component.id)}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-2 text-left transition-colors',
              isActive
                ? 'border-primary/50 bg-card/60'
                : 'border-border/50 bg-card/25 hover:border-primary/30'
            )}
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-xs font-medium whitespace-nowrap">{component.displayName}</span>
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  hasArtwork ? 'bg-emerald-500/70' : 'bg-border'
                )}
                title={hasArtwork ? 'Artwork uploaded' : 'No artwork yet'}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}
