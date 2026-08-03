'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Checkbox with the shadcn/Radix API surface (`checked` / `onCheckedChange`)
 * but no new dependency — this repo runs an npm release-age cooldown, so a
 * 30-line native input beats pulling `@radix-ui/react-checkbox` in. Swap to
 * the Radix primitive later without touching call sites.
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <span className={cn('relative inline-flex h-4 w-4 shrink-0 items-center justify-center', className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[4px] border border-input bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <Check
        aria-hidden
        className="pointer-events-none h-3 w-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  )
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
