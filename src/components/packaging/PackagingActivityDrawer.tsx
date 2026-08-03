'use client'

import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePackagingActivity, type PackagingActivityEntry } from '@/hooks/usePackaging'

/**
 * Who did what on this packet. Three roles edit the same components, so the
 * audit trail answers the question the team actually asks: did the artwork
 * change after the brief was generated?
 */

const ACTION_TEXT: Record<string, string> = {
  created_packet: 'created the packet',
  synced_components: 'changed the component selection',
  uploaded_artwork: 'uploaded artwork',
  deleted_artwork: 'removed artwork',
  reparsed_artwork: 're-read plates from the artwork',
  generated_outputs: 'generated supplier packets',
  regenerated_supplier_pdf: 'regenerated a supplier PDF',
  imported_workbook: 'imported a workbook',
  imported_workbook_created: 'created the packet from a workbook',
}

function describe(entry: PackagingActivityEntry): string {
  const base = ACTION_TEXT[entry.action] ?? entry.action.replace(/_/g, ' ')
  const meta = entry.metadata ?? {}
  const bits: string[] = []

  if (typeof meta.fileName === 'string') bits.push(meta.fileName)
  if (typeof meta.kind === 'string') bits.push(String(meta.kind).replace('_', ' '))
  if (typeof meta.added === 'number' && meta.added > 0) bits.push(`+${meta.added}`)
  if (typeof meta.removed === 'number' && meta.removed > 0) bits.push(`−${meta.removed}`)
  if (typeof meta.generated === 'number') bits.push(`${meta.generated} PDF(s)`)
  if (typeof meta.appliedFields === 'number') bits.push(`${meta.appliedFields} field(s)`)
  if (meta.aiCompatible === false) bits.push('not PDF-compatible')

  return bits.length > 0 ? `${base} — ${bits.join(', ')}` : base
}

export function PackagingActivityDrawer({
  open,
  onOpenChange,
  packetId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  packetId: string
}) {
  const { data: activity = [], isLoading } = usePackagingActivity(packetId, open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Activity</DialogTitle>
          <DialogDescription>Everything that has happened on this packet.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg border border-border/40 bg-card/20 animate-pulse" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <ol className="space-y-0">
              {activity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 border-b border-border/40 py-3 last:border-0"
                >
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className="font-medium">{entry.user.name}</span>{' '}
                      <span className="text-muted-foreground">{describe(entry)}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ActivityButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onClick}>
      <History className="h-3.5 w-3.5" />
      Activity
    </Button>
  )
}
