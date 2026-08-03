'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  useCreateComponentType,
  usePackagingComponentTypes,
  useSyncPacketComponents,
  useUpdateComponentType,
  type PackagingComponent,
  type PackagingComponentType,
} from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'
import { slugifyComponentName } from '@/lib/packaging/catalogue'

/**
 * Screen 3: the components library — "every single component that could exist
 * in packaging. So I'm just picking." Ticking here creates the project-specific
 * set that flows into Product Setup.
 *
 * Deselecting something that already carries artwork or specs comes back as a
 * 409 with what would be lost, so a mis-click can't quietly destroy work.
 */
/**
 * Inline editor for one library entry. The component ID is the field Anna most
 * needs: they are left empty on seed because her template generates them
 * positionally over a different component list, so the real numbers have to
 * come from her.
 */
function CatalogueEditor({
  type,
  onDone,
}: {
  type: PackagingComponentType
  onDone: () => void
}) {
  const update = useUpdateComponentType()
  const { toast } = useToast()
  const [code, setCode] = useState(type.code ?? '')
  const [displayName, setDisplayName] = useState(type.displayName)
  const [printed, setPrinted] = useState(type.printed)

  const save = async () => {
    try {
      await update.mutateAsync({
        id: type.id,
        code: code.trim() || null,
        displayName: displayName.trim() || type.displayName,
        printed,
      })
      onDone()
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-card/60 p-3">
      <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">Component ID</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="C011"
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2">
          <Switch checked={printed} onCheckedChange={setPrinted} />
          <span className="text-[11px] text-muted-foreground">
            Printed {printed ? '' : '— pack instructions only'}
          </span>
        </label>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onDone}>
            <X className="h-3 w-3" />
            Cancel
          </Button>
          <Button size="sm" className="h-7 gap-1 px-2 text-xs" disabled={update.isPending} onClick={save}>
            <Check className="h-3 w-3" />
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">
        {type.slug}
        {type.inUse ? ' · in use, tab name is frozen' : ''}
      </p>
    </div>
  )
}

function NewComponentForm({ onDone }: { onDone: () => void }) {
  const create = useCreateComponentType()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [printed, setPrinted] = useState(true)
  const slug = slugifyComponentName(displayName)

  const submit = async () => {
    if (!slug) return
    try {
      await create.mutateAsync({
        slug,
        displayName: displayName.trim(),
        code: code.trim() || null,
        printed,
      })
      setDisplayName('')
      setCode('')
      onDone()
    } catch (err) {
      toast({
        title: 'Could not add the component',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Add to the library
      </p>
      <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="C013"
          className="h-8 font-mono text-xs"
        />
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Component name, e.g. Outer carton"
          className="h-8 text-xs"
        />
      </div>
      {slug && (
        <p className="font-mono text-[10px] text-muted-foreground">
          Tab name: {slug} — artwork filenames must start with this exactly.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2">
          <Switch checked={printed} onCheckedChange={setPrinted} />
          <span className="text-[11px] text-muted-foreground">Printed</span>
        </label>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!slug || create.isPending}
          onClick={submit}
        >
          {create.isPending ? 'Adding…' : 'Add component'}
        </Button>
      </div>
    </div>
  )
}

export function ComponentLibraryDialog({
  open,
  onOpenChange,
  packetId,
  selected,
  canWrite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  packetId: string
  selected: PackagingComponent[]
  canWrite: boolean
}) {
  const { data: catalogue = [], isLoading } = usePackagingComponentTypes()
  const sync = useSyncPacketComponents(packetId)
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Adopt the packet's current selection each time the dialog opens.
  useEffect(() => {
    if (open) setChecked(new Set(selected.map((c) => c.componentTypeId)))
  }, [open, selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalogue
    return catalogue.filter(
      (type) =>
        type.displayName.toLowerCase().includes(q) ||
        type.slug.toLowerCase().includes(q) ||
        (type.code ?? '').toLowerCase().includes(q)
    )
  }, [catalogue, query])

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async (force = false) => {
    try {
      const result = await sync.mutateAsync({
        componentTypeIds: Array.from(checked),
        force,
      })
      onOpenChange(false)
      const bits = [
        result.added ? `${result.added} added` : null,
        result.removed ? `${result.removed} removed` : null,
      ].filter(Boolean)
      toast({
        title: 'Components updated',
        description: bits.length ? bits.join(', ') : 'No changes.',
      })
    } catch (err) {
      const payload = (err as { payload?: { wouldLose?: Array<{ displayName: string }> } }).payload
      if (payload?.wouldLose?.length) {
        const names = payload.wouldLose.map((c) => c.displayName).join(', ')
        toast({
          title: 'These components have work on them',
          description: `${names} — removing them deletes their artwork and specs.`,
          variant: 'destructive',
          action: (
            <Button size="sm" variant="outline" onClick={() => save(true)}>
              Remove anyway
            </Button>
          ),
        })
        return
      }
      toast({
        title: 'Could not update components',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Components library</DialogTitle>
          <DialogDescription>
            Every packaging component Loop can produce. Tick the ones in this pack.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search components…"
            className="pl-9"
          />
        </div>

        <div className="max-h-[45vh] overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-lg border border-border/40 bg-card/20 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="space-y-1.5 py-1">
              {filtered.map((type) => {
                const isChecked = checked.has(type.id)
                if (editingId === type.id) {
                  return (
                    <li key={type.id}>
                      <CatalogueEditor type={type} onDone={() => setEditingId(null)} />
                    </li>
                  )
                }
                return (
                  <li key={type.id} className="group relative">
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 pr-10 transition-colors',
                        isChecked
                          ? 'border-primary/40 bg-card/60'
                          : 'border-border/50 bg-card/20 hover:border-primary/25'
                      )}
                    >
                      <Checkbox checked={isChecked} onCheckedChange={() => toggle(type.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium">{type.displayName}</span>
                          {type.code ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {type.code}
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground/50">
                              no ID
                            </span>
                          )}
                          {!type.printed && (
                            <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                              not printed
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                          {type.slug}
                        </span>
                      </span>
                    </label>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => setEditingId(type.id)}
                        aria-label={`Edit ${type.displayName} in the library`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {canWrite &&
          (adding ? (
            <NewComponentForm onDone={() => setAdding(false)} />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs text-muted-foreground"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add a component to the library
            </Button>
          ))}

        <DialogFooter className="items-center justify-between sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {checked.size} selected
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save(false)} disabled={sync.isPending}>
              {sync.isPending ? 'Saving…' : 'Save selection'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
