'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, FileUp, Sparkles, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useGeneratePacketOutputs,
  useUploadPackagingArtwork,
  type PackagingPacket,
  type PacketReadiness,
  type SupplierPdfOutcome,
} from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'

/**
 * Screen 6: "at the end should be a button that says create suppliers packets
 * and it will do the PDF."
 *
 * Readiness is shown as warnings, never as a gate — a component still waiting
 * on files is a normal state, and the team wants the brief for everything that
 * IS ready.
 */
export function GeneratePanel({
  packet,
  readiness,
  canWrite,
}: {
  packet: PackagingPacket
  readiness: PacketReadiness
  canWrite: boolean
}) {
  const generate = useGeneratePacketOutputs(packet.id)
  const upload = useUploadPackagingArtwork(packet.id)
  const { toast } = useToast()
  const overviewInput = useRef<HTMLInputElement>(null)
  const [outcomes, setOutcomes] = useState<SupplierPdfOutcome[] | null>(null)

  const run = async () => {
    try {
      const result = await generate.mutateAsync()
      setOutcomes(result.supplierPdfs)
      const generated = result.supplierPdfs.filter((r) => r.status === 'generated').length
      const failed = result.supplierPdfs.filter((r) => r.status === 'failed').length
      toast({
        title:
          result.creativeIntent.status === 'generated'
            ? 'Supplier packets created'
            : 'Supplier PDFs done, Creative Intent failed',
        description: [
          `${generated} supplier PDF${generated === 1 ? '' : 's'}`,
          failed ? `${failed} failed` : null,
          result.creativeIntent.reason,
        ]
          .filter(Boolean)
          .join(' · '),
        variant: result.creativeIntent.status === 'generated' ? undefined : 'destructive',
      })
    } catch (err) {
      toast({
        title: 'Generation failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const uploadOverview = async (file: File) => {
    try {
      await upload.mutateAsync({ file, kind: 'overview' })
      toast({ title: 'Overview render uploaded' })
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const componentsWithPdf = packet.components.filter((c) => c.supplierPdfUrl)

  return (
    <div className="space-y-5">
      {/* Overview render — the exploded shot the Creative Intent opens on. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/25 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Overview render
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {packet.overview
              ? packet.overview.fileName
              : 'Exploded product shot for the Creative Intent cover.'}
          </p>
        </div>
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            disabled={upload.isPending}
            onClick={() => overviewInput.current?.click()}
          >
            <FileUp className="h-3.5 w-3.5" />
            {upload.isPending ? 'Uploading…' : packet.overview ? 'Replace' : 'Upload'}
          </Button>
        )}
        <input
          ref={overviewInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void uploadOverview(file)
            e.target.value = ''
          }}
        />
      </div>

      {readiness.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Worth knowing before you generate
          </p>
          <ul className="mt-2.5 space-y-1">
            {readiness.warnings.map((warning) => (
              <li key={warning} className="text-xs text-muted-foreground">
                {warning}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground/80">
            None of these block generation — components without files simply show
            &ldquo;[no artwork]&rdquo;.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canWrite && (
          <Button onClick={run} disabled={generate.isPending} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {generate.isPending ? 'Generating…' : 'Create supplier packets'}
          </Button>
        )}
        {packet.creativeIntentPdfUrl && (
          <a
            href={packet.creativeIntentPdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm font-medium hover:border-primary/40 hover:text-primary"
          >
            <FileText className="h-4 w-4" />
            Creative Intent PDF
          </a>
        )}
      </div>

      {packet.pdfError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {packet.pdfError}
        </p>
      )}

      {(componentsWithPdf.length > 0 || outcomes) && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Supplier PDFs
          </p>
          <ul className="space-y-1.5">
            {packet.components.map((component) => {
              const outcome = outcomes?.find((o) => o.componentId === component.id)
              const status = outcome?.status ?? (component.supplierPdfUrl ? 'generated' : null)
              const reason = outcome?.reason ?? component.supplierPdfError
              if (!status && !reason) return null
              return (
                <li
                  key={component.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/25 p-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {status === 'generated' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : status === 'failed' ? (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm">{component.displayName}</p>
                      {reason && (
                        <p
                          className={cn(
                            'truncate text-[11px]',
                            status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                          )}
                          title={reason}
                        >
                          {reason}
                        </p>
                      )}
                    </div>
                  </div>
                  {component.supplierPdfUrl && (
                    <a
                      href={component.supplierPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      Open
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
