'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdatePacketComponent, type PackagingComponent } from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'

/**
 * The human half of a component page — the fields different stakeholders fill
 * in: "what coating are we using? What thickness of paper?"
 *
 * The machine half (inks, finishes, structural plates, print part number) is
 * NOT editable here. Those are read from the .ai and shown in the artwork
 * panel; typing them by hand would only be overwritten on the next upload.
 */

const APPROVAL_STATUSES = ['Draft', 'In Review', 'Approved'] as const
const AUTOSAVE_DELAY_MS = 700

const TEXT_FIELDS = [
  { key: 'material', label: 'Material', placeholder: '450gr Simwhite Paper' },
  { key: 'printingMethod', label: 'Printing method', placeholder: 'Offset' },
  { key: 'coatingMsdsRef', label: 'Coating / MSDS ref.', placeholder: 'Water Based Coating' },
  { key: 'drawingPartNumber', label: 'Drawing part no.', placeholder: '510-XXXXXX' },
] as const

/**
 * The Dimensions block, as Anna's workbook lists it. Free text, not numbers —
 * the sheet carries values like "≈12.5" and the round trip has to be lossless.
 */
const DIMENSION_FIELDS = [
  { key: 'heightMm', label: 'Height (mm)', placeholder: '120' },
  { key: 'widthMm', label: 'Width (mm)', placeholder: '80' },
  { key: 'depthMm', label: 'Depth (mm)', placeholder: '25' },
  { key: 'netWeightG', label: 'Net weight (g)', placeholder: '45' },
  { key: 'paperThickness', label: 'Paper thickness', placeholder: '450 gsm' },
] as const

export function ComponentSpecForm({
  packetId,
  component,
  canWrite,
}: {
  packetId: string
  component: PackagingComponent
  canWrite: boolean
}) {
  const update = useUpdatePacketComponent(packetId)
  const { toast } = useToast()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    setDraft({})
  }, [component.id])

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout)
    },
    []
  )

  const valueOf = (key: string): string =>
    draft[key] ?? ((component as unknown as Record<string, string | null>)[key] ?? '')

  const save = (key: string, value: string | null) => {
    update.mutate(
      { componentId: component.id, [key]: value },
      {
        onError: (err) =>
          toast({
            title: 'Could not save',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          }),
      }
    )
  }

  // Debounced so a sentence of notes is one request, not thirty.
  const edit = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => save(key, value.trim() || null), AUTOSAVE_DELAY_MS)
  }

  const disabled = !canWrite

  return (
    <div className="space-y-5 rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Specifications
        </p>
        <div className="w-40">
          <Select
            value={component.approvalStatus}
            disabled={disabled}
            onValueChange={(value) => save('approvalStatus', value)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPROVAL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => {
          // Printing method is meaningless on a part nothing is printed on.
          const notApplicable = !component.printed && field.key === 'printingMethod'
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`spec-${field.key}`} className="text-xs">
                {field.label}
              </Label>
              <Input
                id={`spec-${field.key}`}
                value={valueOf(field.key)}
                placeholder={notApplicable ? 'Not printed' : field.placeholder}
                disabled={disabled || notApplicable}
                onChange={(e) => edit(field.key, e.target.value)}
              />
            </div>
          )
        })}
      </div>

      <div className="space-y-3 border-t border-border/50 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Dimensions
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {DIMENSION_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`dim-${field.key}`} className="text-xs">
                {field.label}
              </Label>
              <Input
                id={`dim-${field.key}`}
                value={valueOf(field.key)}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(e) => edit(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dim-sticker" className="text-xs">
            Sticker / element placement
          </Label>
          <Textarea
            id="dim-sticker"
            rows={2}
            value={valueOf('stickerPlacement')}
            disabled={disabled}
            placeholder="Where stickers or applied elements sit on this part."
            onChange={(e) => edit('stickerPlacement', e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 border-t border-border/50 pt-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="spec-notes" className="text-xs">
            Engineer notes
          </Label>
          <Textarea
            id="spec-notes"
            rows={3}
            value={valueOf('engineerNotes')}
            disabled={disabled}
            placeholder="Anything the supplier needs to know about this part."
            onChange={(e) => edit('engineerNotes', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="spec-per-product" className="text-xs">
            Per-product notes
          </Label>
          <Textarea
            id="spec-per-product"
            rows={3}
            value={valueOf('perProductNotes')}
            disabled={disabled}
            placeholder="Why this component is in THIS pack — internal, not for the supplier."
            onChange={(e) => edit('perProductNotes', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border/50 pt-4">
        <Label htmlFor="spec-pdf-title" className="text-xs">
          Creative Intent page title
        </Label>
        <Input
          id="spec-pdf-title"
          value={valueOf('pdfPageTitle')}
          placeholder={component.displayName}
          disabled={disabled}
          onChange={(e) => edit('pdfPageTitle', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to use the component name.
        </p>
      </div>
    </div>
  )
}
