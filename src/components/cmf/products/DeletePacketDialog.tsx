'use client'

/**
 * Confirmation prompt for packet deletion.
 *
 * Destructive operations should require a deliberate "yes". The copy
 * spells out exactly what will be lost (SKU count, attempts,
 * approvals, exported PDFs) so a designer can't nuke a packet they
 * meant to keep.
 *
 * Lifted out of `CmfProductsDialog` so the shell stays focused on
 * the rail/overview composition. The mutation lives here too — the
 * dialog is the only caller, so co-locating the network call with
 * the confirmation UI keeps the contract obvious: "open this dialog
 * with a target, delete fires when the user confirms".
 */

import { Loader2, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteCmfPacket } from '@/hooks/useCmf'
import { useToast } from '@/components/ui/use-toast'

export interface DeletePacketTarget {
  id: string
  name: string
  cmfCode: string | null
  skuCount: number
}

interface DeletePacketDialogProps {
  /** Target packet(s), or null when the dialog is closed. */
  targets: DeletePacketTarget[] | null
  /** Fired with `null` when the user cancels. */
  onTargetsChange: (next: DeletePacketTarget[] | null) => void
  /** Fired after successful deletion(s). */
  onDeleted: (packetIds: string[]) => void
}

export function DeletePacketDialog({
  targets,
  onTargetsChange,
  onDeleted,
}: DeletePacketDialogProps) {
  const deleteMutation = useDeleteCmfPacket()
  const { toast } = useToast()
  const count = targets?.length ?? 0
  const names = (targets ?? []).map((t) => t.name)
  const totalSkus = (targets ?? []).reduce((acc, target) => acc + target.skuCount, 0)

  return (
    <AlertDialog
      open={targets !== null}
      onOpenChange={(next) => {
        // Block close while the network call is in flight so the user
        // can't double-fire (the spinner wouldn't even have time to
        // show otherwise).
        if (!next && !deleteMutation.isPending) onTargetsChange(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            {count <= 1 ? 'Delete packet?' : `Delete ${count} packets?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              <span className="font-semibold text-foreground">
                {count <= 1 ? names[0] ?? '' : `${count} selected packets`}
              </span>{' '}
              — {totalSkus} {totalSkus === 1 ? 'SKU' : 'SKUs'} and every
              attempt, approval, and exported PDF tied to
              {count <= 1 ? ' this packet' : ' these packets'}.
            </span>
            {count > 1 && (
              <span className="block text-[11px] text-muted-foreground">
                {names.slice(0, 4).join(' · ')}
                {count > 4 ? ` · +${count - 4} more` : ''}
              </span>
            )}
            <span className="block text-destructive">
              This cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={deleteMutation.isPending}
            onClick={async (event) => {
              // Stop Radix from auto-closing — we need the prompt to
              // stay up while the network call runs so the spinner
              // is visible and the user can't double-fire.
              event.preventDefault()
              try {
                if (!targets || targets.length === 0) return
                const deletedIds: string[] = []
                for (const target of targets) {
                  await deleteMutation.mutateAsync({ packetId: target.id })
                  deletedIds.push(target.id)
                }
                toast({
                  title: count <= 1 ? 'Packet deleted' : `${count} packets deleted`,
                  description:
                    count <= 1
                      ? `${names[0]} removed from the library.`
                      : 'Selected packets removed from the library.',
                })
                onDeleted(deletedIds)
                onTargetsChange(null)
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : 'Delete failed'
                toast({ title: 'Delete failed', description: message })
              }
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {count <= 1 ? 'Delete packet' : `Delete ${count} packets`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
