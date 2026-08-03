'use client'

import { cn } from '@/lib/utils'

/**
 * The six-step spine of the workflow, matching the order Anna walked through:
 * pick a project → read its info → pick components from the library → decide
 * what's included and in what order → fill each component's page → generate.
 *
 * Steps are navigable, not gated: different stakeholders arrive at different
 * points (the engineer goes straight to a component page).
 */

export const PACKAGING_STEPS = [
  { key: 'project', label: 'Project' },
  { key: 'info', label: 'Info' },
  { key: 'library', label: 'Library' },
  { key: 'setup', label: 'Setup' },
  { key: 'components', label: 'Components' },
  { key: 'generate', label: 'Generate' },
] as const

export type PackagingStep = (typeof PACKAGING_STEPS)[number]['key']

/** Per-step completeness, so "what is still missing" is visible at a glance. */
export interface StepProgress {
  /** Everything this step needs is present. */
  done?: boolean
  /** Something is worth looking at — shown as an amber dot, never a blocker. */
  attention?: boolean
  /** Tooltip detail. */
  hint?: string
}

export function PackagingPipelineHeader({
  active,
  onSelect,
  disabledFrom,
  progress,
}: {
  active: PackagingStep
  onSelect: (step: PackagingStep) => void
  /** Steps from this index on are unavailable (no packet selected yet). */
  disabledFrom?: number
  progress?: Partial<Record<PackagingStep, StepProgress>>
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PACKAGING_STEPS.map((step, idx) => {
        const isActive = step.key === active
        const disabled = disabledFrom !== undefined && idx >= disabledFrom
        const state = progress?.[step.key]
        return (
          <div key={step.key} className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(step.key)}
              title={state?.hint}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5',
                'text-[11px] font-medium uppercase tracking-wider transition-colors',
                isActive
                  ? 'border-primary/50 text-primary'
                  : 'border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                disabled && 'opacity-40 cursor-not-allowed hover:border-border/50 hover:text-muted-foreground'
              )}
              style={
                isActive
                  ? {
                      backgroundColor:
                        'color-mix(in oklch, hsl(var(--primary)) 10%, transparent)',
                    }
                  : undefined
              }
            >
              <span className="font-mono text-[9px] opacity-60">
                {String(idx + 1).padStart(2, '0')}
              </span>
              {step.label}
              {!disabled && state && (state.done || state.attention) && (
                <span
                  aria-hidden
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    state.attention ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                />
              )}
            </button>
            {idx < PACKAGING_STEPS.length - 1 && (
              <span aria-hidden className="h-px w-3 bg-border/50" />
            )}
          </div>
        )
      })}
    </div>
  )
}
