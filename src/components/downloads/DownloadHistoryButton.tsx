'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { History } from 'lucide-react'
import { useDownloadFlight } from './DownloadHistoryProvider'
import { useDownloadHistory } from '@/hooks/useDownloadHistory'
import { DownloadHistoryModal } from './DownloadHistoryModal'
import { cn } from '@/lib/utils'

/**
 * Top-right toolbar button. Visible to every user (each user sees only
 * their own downloads), unlike the admin-only spending tracker that sits
 * next to it. Registers its node with the `DownloadHistoryProvider` so the
 * fly-to-corner animation knows where to land.
 */
export function DownloadHistoryButton() {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const { registerTarget, pulseActive } = useDownloadFlight()
  const { data: items } = useDownloadHistory()
  const count = items?.length ?? 0

  useEffect(() => {
    registerTarget(buttonRef.current)
    return () => registerTarget(null)
  }, [registerTarget])

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={cn(
          'h-8 w-8 relative transition-transform',
          pulseActive && 'animate-bounce',
        )}
        title="Download history"
      >
        <History className="h-4 w-4" />
        {count > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full',
              'bg-primary text-primary-foreground text-[10px] font-semibold',
              'flex items-center justify-center leading-none',
              'border border-background',
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>
      <DownloadHistoryModal open={open} onOpenChange={setOpen} />
    </>
  )
}
