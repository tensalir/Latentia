'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Info, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  useImportWorkbook,
  usePreviewWorkbook,
  workbookDownloadUrl,
  type PackagingPacket,
  type WorkbookDiffEntry,
  type WorkbookPreview,
} from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'

/**
 * The Excel bridge. The team keeps working in Google Sheets, so a packet can be
 * downloaded as a workbook and read back.
 *
 * An import always previews first: the diff spells out what would change and,
 * just as importantly, what would NOT — hand-edited ink lists are ignored
 * because the .ai owns them, and a tab lost in a Sheets round-trip leaves its
 * specs alone rather than wiping them.
 */

const ACTION_LABEL: Record<WorkbookDiffEntry['action'], string> = {
  apply: 'Will change',
  unchanged: 'Unchanged',
  'machine-skip': 'Ignored',
  'missing-tab-keep': 'Kept',
  'add-component': 'Will be added',
  'unknown-component': 'Not in library',
}

const ACTION_TONE: Record<WorkbookDiffEntry['action'], string> = {
  apply: 'border-primary/40 text-primary',
  unchanged: 'border-border/60 text-muted-foreground',
  'machine-skip': 'border-border/60 text-muted-foreground',
  'missing-tab-keep': 'border-border/60 text-muted-foreground',
  'add-component': 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  'unknown-component': 'border-destructive/50 text-destructive',
}

function DiffRow({ entry }: { entry: WorkbookDiffEntry }) {
  return (
    <li className="flex items-start gap-3 border-b border-border/40 py-2 last:border-0">
      <span
        className={cn(
          'mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
          ACTION_TONE[entry.action]
        )}
      >
        {ACTION_LABEL[entry.action]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">
          {entry.componentSlug ? `${entry.componentSlug} · ` : ''}
          {entry.field}
        </span>
        {entry.action === 'apply' ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            <span className="line-through opacity-70">{entry.dbValue ?? '—'}</span>
            {'  →  '}
            <span className="text-foreground">{entry.sheetValue ?? '—'}</span>
          </span>
        ) : (
          entry.note && (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">{entry.note}</span>
          )
        )}
      </span>
    </li>
  )
}

export function WorkbookDialog({
  open,
  onOpenChange,
  packet,
  canWrite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  packet: PackagingPacket
  canWrite: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const preview = usePreviewWorkbook()
  const importWorkbook = useImportWorkbook()
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<WorkbookPreview | null>(null)
  const [dragging, setDragging] = useState(false)

  const reset = () => {
    setFile(null)
    setResult(null)
  }

  const runPreview = async (candidate: File) => {
    setFile(candidate)
    setResult(null)
    try {
      const data = await preview.mutateAsync({ file: candidate, packetId: packet.id })
      setResult(data)
    } catch (err) {
      const hint = (err as { payload?: { hint?: string } }).payload?.hint
      toast({
        title: 'Could not read that workbook',
        description: [err instanceof Error ? err.message : 'Unknown error', hint]
          .filter(Boolean)
          .join(' '),
        variant: 'destructive',
      })
      reset()
    }
  }

  const commit = async () => {
    if (!file) return
    try {
      const data = await importWorkbook.mutateAsync({ file, packetId: packet.id })
      const r = data.result
      toast({
        title: 'Workbook imported',
        description: [
          `${r.appliedFields} field${r.appliedFields === 1 ? '' : 's'} updated`,
          r.addedComponents.length ? `${r.addedComponents.length} component(s) added` : null,
          r.skippedMachineFields ? `${r.skippedMachineFields} artwork-owned value(s) ignored` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })
      onOpenChange(false)
      reset()
    } catch (err) {
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const changes = result?.diff?.changes ?? []
  const willChange = changes.filter((c) => c.action === 'apply' || c.action === 'add-component')
  const wontChange = changes.filter((c) => c.action !== 'apply' && c.action !== 'add-component')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Excel workbook</DialogTitle>
          <DialogDescription>
            Download the packet as a Creative Intent workbook, edit it in Google Sheets, then bring
            it back.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/25 p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Download
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {packet.lastExportedAt
                ? `Last exported ${new Date(packet.lastExportedAt).toLocaleString()}`
                : 'Filled with everything currently in Vesper.'}
            </p>
          </div>
          <a
            href={workbookDownloadUrl(packet.id)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs font-medium hover:border-primary/40 hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" />
            Workbook (.xlsx)
          </a>
        </div>

        {canWrite && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const dropped = e.dataTransfer.files?.[0]
              if (dropped) void runPreview(dropped)
            }}
            className={cn(
              'rounded-xl border border-dashed p-5 text-center transition-colors',
              dragging ? 'border-primary/60 bg-card/50' : 'border-border/50 bg-card/20'
            )}
          >
            <FileSpreadsheet className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-3 text-sm">
              {file ? file.name : 'Drop an edited workbook here to see what would change'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5 text-xs"
              disabled={preview.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {preview.isPending ? 'Reading…' : file ? 'Choose another' : 'Choose file'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0]
                if (chosen) void runPreview(chosen)
                e.target.value = ''
              }}
            />
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{result.target.note}</p>

            {result.diagnostics.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                {result.diagnostics.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                    {d}
                  </li>
                ))}
              </ul>
            )}

            <div className="max-h-[32vh] overflow-y-auto rounded-lg border border-border/50 bg-card/20 px-3">
              {willChange.length === 0 && wontChange.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nothing differs from what Vesper already has.
                </p>
              ) : (
                <>
                  {willChange.length > 0 && (
                    <>
                      <p className="pt-3 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {willChange.length} change{willChange.length === 1 ? '' : 's'} to apply
                      </p>
                      <ul>
                        {willChange.map((entry, i) => (
                          <DiffRow key={`${entry.componentSlug}-${entry.field}-${i}`} entry={entry} />
                        ))}
                      </ul>
                    </>
                  )}
                  {wontChange.length > 0 && (
                    <>
                      <p className="pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Left alone
                      </p>
                      <ul>
                        {wontChange.map((entry, i) => (
                          <DiffRow key={`skip-${entry.componentSlug}-${entry.field}-${i}`} entry={entry} />
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>

            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Inks, finishes and the print part number are read from the Illustrator file, so edits
              to those cells are ignored. Blank cells keep the stored value — clearing a field is
              done here in Vesper.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canWrite && result && (
            <Button onClick={commit} disabled={importWorkbook.isPending}>
              {importWorkbook.isPending
                ? 'Importing…'
                : willChange.length > 0
                  ? `Apply ${willChange.length} change${willChange.length === 1 ? '' : 's'}`
                  : 'Import anyway'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
