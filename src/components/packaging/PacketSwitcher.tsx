'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useCreatePackagingPacket, type PackagingProjectWithPackets } from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'
import { PackagingStatusBadge } from './PackagingStatusBadge'

const STAGES = ['EVT', 'DVT', 'PVT', 'MP'] as const

/**
 * Stage × colourway matrix. Anna keeps one workbook per SKU per stage, so a
 * packet is exactly that pair — Black EVT and Blue EVT never mix.
 */
export function PacketSwitcher({
  project,
  activePacketId,
  onSelect,
  canWrite,
}: {
  project: PackagingProjectWithPackets
  activePacketId: string | null
  onSelect: (id: string) => void
  canWrite: boolean
}) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<string>('EVT')
  const [variant, setVariant] = useState('')
  const createPacket = useCreatePackagingPacket()
  const { toast } = useToast()

  const submit = async () => {
    try {
      const packet = await createPacket.mutateAsync({
        projectId: project.id,
        stage,
        variant: variant.trim() || 'Default',
      })
      setOpen(false)
      setVariant('')
      onSelect(packet.id)
    } catch (err) {
      const payload = (err as { payload?: { packetId?: string } }).payload
      // A duplicate isn't a dead end — jump to the packet that already exists.
      if (payload?.packetId) {
        setOpen(false)
        onSelect(payload.packetId)
        toast({
          title: 'That packet already exists',
          description: 'Opened it instead of creating a duplicate.',
        })
        return
      }
      toast({
        title: 'Could not create packet',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Stage &amp; colourway
        </p>
        {canWrite && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="h-7 gap-1.5 px-2 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New packet
          </Button>
        )}
      </div>

      {project.packets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-card/20 p-4 text-sm text-muted-foreground">
          No packets yet. Create one for the stage and colourway you&apos;re handing over.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {project.packets.map((packet) => {
            const isActive = packet.id === activePacketId
            return (
              <button
                key={packet.id}
                type="button"
                onClick={() => onSelect(packet.id)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-left transition-all',
                  isActive
                    ? 'border-primary/50 bg-card/60'
                    : 'border-border/50 bg-card/30 hover:border-primary/30 hover:bg-card/50'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{packet.stage}</span>
                  <span className="text-sm">{packet.variant}</span>
                  <PackagingStatusBadge status={packet.status} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {packet.componentCount} component{packet.componentCount === 1 ? '' : 's'}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New packet</DialogTitle>
            <DialogDescription>
              One packet per stage and colourway — the equivalent of one Creative Intent workbook.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="packet-variant">Colourway</Label>
              <Input
                id="packet-variant"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                placeholder="Black"
              />
              <p className="text-xs text-muted-foreground">
                Human-readable, never an SKU code. Leave empty if the product has one SKU.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createPacket.isPending}>
              {createPacket.isPending ? 'Creating…' : 'Create packet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
