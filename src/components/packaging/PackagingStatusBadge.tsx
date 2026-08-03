'use client'

import { cn } from '@/lib/utils'

const TONES: Record<string, string> = {
  draft: 'border-border/60 text-muted-foreground',
  generating: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  ready: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  failed: 'border-destructive/50 text-destructive',
}

const LABELS: Record<string, string> = {
  draft: 'Draft',
  generating: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
}

export function PackagingStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        TONES[status] ?? TONES.draft,
        className
      )}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
