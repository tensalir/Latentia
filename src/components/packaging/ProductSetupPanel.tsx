'use client'

import { ArrowDown, ArrowUp, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useUpdatePacketComponent, type PackagingComponent } from '@/hooks/usePackaging'

/**
 * Screen 4: product setup — the project-specific subset.
 *
 * Two decisions per component: does it appear in the Creative Intent, and in
 * what page order. Non-printed parts (tissue paper) stay in the list on
 * purpose — they carry pack instructions even though nothing is printed on
 * them.
 */
export function ProductSetupPanel({
  packetId,
  components,
  canWrite,
  onOpenLibrary,
  onOpenComponent,
}: {
  packetId: string
  components: PackagingComponent[]
  canWrite: boolean
  onOpenLibrary: () => void
  onOpenComponent: (componentId: string) => void
}) {
  const update = useUpdatePacketComponent(packetId)

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= components.length) return
    const a = components[index]
    const b = components[target]
    // Swap the two page orders; the list re-sorts on refetch.
    update.mutate({ componentId: a.id, pageOrder: b.pageOrder })
    update.mutate({ componentId: b.id, pageOrder: a.pageOrder })
  }

  if (components.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 bg-card/20 p-10 text-center">
        <LayoutGrid className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-4 text-sm text-muted-foreground">
          No components picked yet for this packet.
        </p>
        {canWrite && (
          <Button variant="outline" className="mt-4" onClick={onOpenLibrary}>
            Open components library
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Product setup
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            What goes in the Creative Intent, and in which order.
          </p>
        </div>
        {canWrite && (
          <Button variant="outline" size="sm" onClick={onOpenLibrary}>
            Edit selection
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {components.map((component, index) => (
          <li
            key={component.id}
            className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 p-3"
          >
            <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>

            <button
              type="button"
              onClick={() => onOpenComponent(component.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium hover:text-primary">
                  {component.displayName}
                </span>
                {component.code && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {component.code}
                  </span>
                )}
                {!component.printed && (
                  <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                    not printed
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {component.artworks.some((a) => a.kind === 'editable_ai')
                  ? `${component.inks.length} inks · ${component.finishes.length} finishes · ${component.structuralPlates.length} structural`
                  : 'No artwork yet'}
              </span>
            </button>

            {canWrite && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${component.displayName} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={index === components.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${component.displayName} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <label
              className={cn(
                'flex shrink-0 items-center gap-2 pl-2',
                !canWrite && 'pointer-events-none opacity-70'
              )}
            >
              <Switch
                checked={component.includeInCreativeIntent}
                disabled={!canWrite}
                onCheckedChange={(checked) =>
                  update.mutate({ componentId: component.id, includeInCreativeIntent: checked })
                }
                aria-label={`Include ${component.displayName} in the Creative Intent`}
              />
              <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                In brief
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
