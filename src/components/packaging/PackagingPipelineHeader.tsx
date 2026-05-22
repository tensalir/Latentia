'use client'

import { cn } from '@/lib/utils'

export type PackagingStageKey =
  | 'workbook'
  | 'artwork'
  | 'plates'
  | 'review'
  | 'preview'
  | 'export'

const STAGES: { key: PackagingStageKey; label: string; num: string }[] = [
  { key: 'workbook', label: 'Workbook', num: '01' },
  { key: 'artwork', label: 'Artwork', num: '02' },
  { key: 'plates', label: 'Plates', num: '03' },
  { key: 'review', label: 'Review', num: '04' },
  { key: 'preview', label: 'Preview', num: '05' },
  { key: 'export', label: 'Export', num: '06' },
]

export function PackagingPipelineHeader({
  active,
  onStageClick,
}: {
  active: PackagingStageKey
  onStageClick: (stage: PackagingStageKey) => void
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Packaging pipeline">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStageClick(s.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider border transition-colors',
              active === s.key
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/50 text-muted-foreground hover:border-primary/30'
            )}
          >
            <span className="font-mono opacity-60">{s.num}</span>
            {s.label}
          </button>
          {i < STAGES.length - 1 && <span className="h-px w-3 bg-border/40" aria-hidden />}
        </div>
      ))}
    </nav>
  )
}
