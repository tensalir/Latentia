'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, Download, FileText, FileUp, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useDeletePackagingArtwork,
  useRegenerateSupplierPdf,
  useReparseArtwork,
  useUploadPackagingArtwork,
  type ArtworkKind,
  type PackagingArtwork,
  type PackagingComponent,
} from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'

/**
 * The machine half of a component page.
 *
 * Two uploads: the editable .ai (the graphic designer's master) and the mockup
 * render. On upload the server reads the .ai's plate names and fills the ink,
 * finish and structural-plate chips plus the Print Part Number — "we don't
 * need to fill the printing information, it knows what it needs to take."
 *
 * Those chips are read-only on purpose.
 */

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  const mb = bytes / 1_048_576
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function UploadSlot({
  label,
  hint,
  accept,
  artwork,
  kind,
  packetId,
  componentId,
  canWrite,
}: {
  label: string
  hint: string
  accept: string
  artwork: PackagingArtwork | undefined
  kind: ArtworkKind
  packetId: string
  componentId: string
  canWrite: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadPackagingArtwork(packetId)
  const remove = useDeletePackagingArtwork(packetId)
  const { toast } = useToast()
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file: File) => {
    try {
      const result = await upload.mutateAsync({ file, kind, packetComponentId: componentId })
      if (result.warning) {
        toast({ title: 'Uploaded, with a catch', description: result.warning, variant: 'destructive' })
      } else if (result.nameWarnings.length > 0) {
        toast({
          title: 'Uploaded — check the filename',
          description: result.nameWarnings.join(' '),
        })
      } else if (result.plates) {
        const { inks, finishes, structural } = result.plates
        toast({
          title: 'Artwork read',
          description: `${inks.length} inks, ${finishes.length} finishes, ${structural.length} structural plates.`,
        })
      } else {
        toast({ title: `${label} uploaded` })
      }
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const busy = upload.isPending || remove.isPending

  return (
    <div
      onDragOver={(e) => {
        if (!canWrite) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canWrite) return
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void handleFile(file)
      }}
      className={cn(
        'rounded-xl border p-4 transition-colors',
        dragging ? 'border-primary/60 bg-card/60' : 'border-border/50 bg-card/25'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {artwork ? (
            <>
              <p className="mt-1.5 truncate font-mono text-xs" title={artwork.fileName}>
                {artwork.fileName}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {[
                  formatBytes(artwork.byteSize),
                  artwork.pageCount ? `${artwork.pageCount} page${artwork.pageCount === 1 ? '' : 's'}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {artwork?.downloadUrl && (
            <a
              href={artwork.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-2 text-muted-foreground hover:text-primary"
              aria-label={`Download ${artwork.fileName}`}
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          {canWrite && artwork && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => remove.mutate(artwork.id)}
              aria-label={`Remove ${artwork.fileName}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className="h-3.5 w-3.5" />
              {busy ? 'Working…' : artwork ? 'Replace' : 'Upload'}
            </Button>
          )}
        </div>
      </div>

      {artwork?.aiCompatible === false && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Not PDF-compatible — no supplier brief can be stamped from this file. Re-save the .ai with
          &ldquo;Create PDF Compatible File&rdquo; ticked.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Re-read plates from the stored file — useful after the keyword vocabulary
 *  changes, when the artwork is unchanged but our reading of it isn't. */
function ReparseButton({ packetId, artworkId }: { packetId: string; artworkId: string }) {
  const reparse = useReparseArtwork(packetId)
  const { toast } = useToast()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
      disabled={reparse.isPending}
      onClick={() =>
        reparse.mutate(artworkId, {
          onSuccess: (data) =>
            toast({
              title: 'Re-read from the artwork',
              description: `${data.plates.inks.length} inks, ${data.plates.finishes.length} finishes, ${data.plates.structural.length} structural plates.`,
            }),
          onError: (err) =>
            toast({
              title: 'Could not re-read the artwork',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'destructive',
            }),
        })
      }
    >
      <RefreshCw className={cn('h-3 w-3', reparse.isPending && 'animate-spin')} />
      {reparse.isPending ? 'Reading…' : 'Re-read plates'}
    </Button>
  )
}

/** Re-stamp just this component's brief after a spec or artwork correction,
 *  rather than re-running the whole packet. */
function RegenerateButton({
  packetId,
  component,
}: {
  packetId: string
  component: PackagingComponent
}) {
  const regenerate = useRegenerateSupplierPdf(packetId)
  const { toast } = useToast()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
      disabled={regenerate.isPending}
      onClick={() =>
        regenerate.mutate(component.id, {
          onSuccess: (outcome) =>
            toast({
              title:
                outcome.status === 'generated'
                  ? 'Supplier PDF rebuilt'
                  : outcome.status === 'skipped'
                    ? 'Skipped'
                    : 'Could not build the PDF',
              description:
                outcome.reason ??
                (outcome.pageCount
                  ? `${outcome.pageCount} page${outcome.pageCount === 1 ? '' : 's'} stamped.`
                  : undefined),
              variant: outcome.status === 'failed' ? 'destructive' : undefined,
            }),
          onError: (err) =>
            toast({
              title: 'Could not build the PDF',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'destructive',
            }),
        })
      }
    >
      <FileText className={cn('h-3 w-3', regenerate.isPending && 'animate-pulse')} />
      {regenerate.isPending ? 'Stamping…' : 'Rebuild supplier PDF'}
    </Button>
  )
}

function PlateChips({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item}
              className={cn(
                'rounded-full border px-2 py-0.5 font-mono text-[10px]',
                tone
              )}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ComponentArtworkPanel({
  packetId,
  component,
  canWrite,
}: {
  packetId: string
  component: PackagingComponent
  canWrite: boolean
}) {
  const editable = component.artworks.find((a) => a.kind === 'editable_ai')
  const editableBack = component.artworks.find((a) => a.kind === 'editable_ai_back')
  const mockup = component.artworks.find((a) => a.kind === 'mockup')
  // Anna's two-face components are printed on both sides and hand over as two
  // files (Artwork_Front / Artwork_Back).
  const isTwoFace = component.style === 'two_face'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <UploadSlot
          label={isTwoFace ? 'Editable artwork — front (.ai)' : 'Editable artwork (.ai)'}
          hint="The graphic designer's master. Inks and plates are read from it."
          accept=".ai,.pdf,application/pdf,application/postscript"
          artwork={editable}
          kind="editable_ai"
          packetId={packetId}
          componentId={component.id}
          canWrite={canWrite}
        />
        {isTwoFace && (
          <UploadSlot
            label="Editable artwork — back (.ai)"
            hint="This component prints on both sides; the reverse gets its own brief."
            accept=".ai,.pdf,application/pdf,application/postscript"
            artwork={editableBack}
            kind="editable_ai_back"
            packetId={packetId}
            componentId={component.id}
            canWrite={canWrite}
          />
        )}
        <UploadSlot
          label="Mockup"
          hint="Component render for the Creative Intent page."
          accept="image/png,image/jpeg"
          artwork={mockup}
          kind="mockup"
          packetId={packetId}
          componentId={component.id}
          canWrite={canWrite}
        />
      </div>

      <div className="rounded-xl border border-border/50 bg-card/25 p-4 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Read from the artwork file
          </p>
          {component.printPartNumber && (
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={component.printPartNumber}>
              {component.printPartNumber}
            </p>
          )}
        </div>

        {canWrite && editable && (
          <div className="flex flex-wrap items-center gap-1">
            <ReparseButton packetId={packetId} artworkId={editable.id} />
            <RegenerateButton packetId={packetId} component={component} />
          </div>
        )}

        {component.platesSyncedAt ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <PlateChips title="Inks" items={component.inks} tone="border-foreground/25" />
            <PlateChips title="Special finishes" items={component.finishes} tone="border-primary/40 text-primary" />
            <PlateChips
              title="Structural plates"
              items={component.structuralPlates}
              tone="border-border/60 text-muted-foreground"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload the editable .ai and its inks, finishes and structural plates appear here
            automatically. Never type them by hand — the next upload overwrites them.
          </p>
        )}
      </div>
    </div>
  )
}
