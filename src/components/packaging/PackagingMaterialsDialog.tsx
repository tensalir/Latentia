'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePackagingMaterials, useCreatePackagingMaterial } from '@/hooks/usePackaging'
import { usePackagingPermissions } from '@/hooks/usePackagingPermissions'
import { Loader2 } from 'lucide-react'

export function PackagingMaterialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: materials, isLoading } = usePackagingMaterials()
  const create = useCreatePackagingMaterial()
  const { canManageMaterials } = usePackagingPermissions()
  const [kind, setKind] = useState('finish')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approved materials library</DialogTitle>
          <DialogDescription>
            Engineers maintain approved papers, coatings, inks, and finishes. Designers see validation
            against this list when plates are extracted.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        ) : (
          <ul className="space-y-2 text-sm max-h-48 overflow-y-auto border rounded-md p-2">
            {(materials ?? []).map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{m.kind}</span> {m.name}
                </span>
                <span className="text-xs text-muted-foreground">{m.code}</span>
              </li>
            ))}
            {!materials?.length && (
              <li className="text-muted-foreground">No materials yet — add the first approved entry.</li>
            )}
          </ul>
        )}

        {canManageMaterials && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add material
            </p>
            <div className="grid gap-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['paper', 'coating', 'ink', 'finish', 'adhesive', 'substrate'].map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LOOP-COAT-01" />
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="UV GLOSS" />
              <Button
                disabled={!code || !name || create.isPending}
                onClick={() => {
                  void create.mutateAsync({ kind, code, name }).then(() => {
                    setCode('')
                    setName('')
                  })
                }}
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Add to library
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
