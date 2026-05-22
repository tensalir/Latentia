'use client'

import { useMemo, useState } from 'react'
import {
  usePackagingPacket,
  usePackagingPackets,
  useUploadPackagingArtwork,
  useGenerateSupplierPdf,
  useGenerateCreativeIntentPdf,
  useUpdateComponentSpecs,
  type PackagingComponent,
} from '@/hooks/usePackaging'
import { useActivePackagingPacket } from '@/hooks/useActivePackagingPacket'
import { usePackagingPermissions } from '@/hooks/usePackagingPermissions'
import { PackagingPipelineHeader, type PackagingStageKey } from './PackagingPipelineHeader'
import { PackagingImportDialog } from './PackagingImportDialog'
import { PackagingMaterialsDialog } from './PackagingMaterialsDialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { SPEC_FIELDS } from '@/lib/packaging/components'
import { evaluatePacketReadiness } from '@/lib/packaging/document'
import {
  Loader2,
  Lock,
  Package,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function PackagingPacketWorkspace({ initialPacketId }: { initialPacketId: string | null }) {
  const { activePacketId, setActivePacketId } = useActivePackagingPacket(initialPacketId)
  const [importOpen, setImportOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [activeStage, setActiveStage] = useState<PackagingStageKey>('workbook')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const { data: packet, isLoading } = usePackagingPacket(activePacketId)
  const { data: allPackets } = usePackagingPackets()
  const { canWrite, canManageMaterials } = usePackagingPermissions()
  const { toast } = useToast()

  const uploadArtwork = useUploadPackagingArtwork(activePacketId ?? '')
  const genSupplier = useGenerateSupplierPdf()
  const genCreative = useGenerateCreativeIntentPdf()
  const updateSpecs = useUpdateComponentSpecs(activePacketId ?? '')

  const components = useMemo(
    () => (packet?.components ?? []).filter((c) => c.included).sort((a, b) => a.pageOrder - b.pageOrder),
    [packet]
  )

  const activeComponent = useMemo(() => {
    const slug = selectedSlug ?? components[0]?.slug
    return components.find((c) => c.slug === slug) ?? null
  }, [components, selectedSlug])

  const readiness = useMemo(
    () => (packet ? evaluatePacketReadiness(packet) : null),
    [packet]
  )

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Loop · Packaging Studio
            </p>
            <h1 className="text-3xl font-bold tracking-tight mt-1">
              {packet?.name ?? 'Packaging pipeline'}
            </h1>
            {packet && (
              <p className="text-sm text-muted-foreground mt-1">
                {packet.project.displayName} · {packet.stage}
                {packet.variant ? ` · ${packet.variant}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageMaterials && (
              <Button variant="outline" size="sm" onClick={() => setMaterialsOpen(true)}>
                Materials library
              </Button>
            )}
            {canWrite ? (
              <Button size="sm" onClick={() => setImportOpen(true)}>
                Import workbook
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> Read-only
              </span>
            )}
          </div>
        </div>
        <PackagingPipelineHeader active={activeStage} onStageClick={setActiveStage} />
      </header>

      {!activePacketId && (
        <div className="rounded-2xl border border-dashed p-12 text-center space-y-4">
          <Package className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Import a workbook or open an existing packet.</p>
          {canWrite && (
            <Button onClick={() => setImportOpen(true)}>Import workbook</Button>
          )}
          {(allPackets ?? []).length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 pt-4">
              {allPackets!.slice(0, 8).map((p) => (
                <Button key={p.id} variant="outline" size="sm" onClick={() => setActivePacketId(p.id)}>
                  {p.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {activePacketId && isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {packet && !isLoading && (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-1">
            {components.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedSlug(c.slug)
                  setActiveStage('review')
                }}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2 text-sm transition-colors',
                  activeComponent?.id === c.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted'
                )}
              >
                {c.displayName}
                {c.supplierPdfUrl && (
                  <CheckCircle2 className="inline h-3 w-3 ml-1 text-emerald-500" />
                )}
              </button>
            ))}
          </aside>

          <main className="space-y-6">
            {activeStage === 'export' && (
              <section className="rounded-xl border p-6 space-y-4">
                <h2 className="font-semibold">Export deliverables</h2>
                {readiness && !readiness.ready && (
                  <p className="text-sm text-amber-600 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {readiness.reasons.join(' · ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {canWrite && (
                    <Button
                      disabled={genCreative.isPending}
                      onClick={async () => {
                        try {
                          const r = await genCreative.mutateAsync(packet.id)
                          toast({ title: 'Creative Intent PDF ready' })
                          if (r.creativeIntentPdfUrl) window.open(r.creativeIntentPdfUrl, '_blank')
                        } catch (e) {
                          toast({
                            title: 'Export failed',
                            description: e instanceof Error ? e.message : '',
                            variant: 'destructive',
                          })
                        }
                      }}
                    >
                      {genCreative.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Generate Creative Intent PDF
                    </Button>
                  )}
                  {packet.creativeIntentPdfUrl && (
                    <Button variant="outline" asChild>
                      <a href={packet.creativeIntentPdfUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Creative Intent
                      </a>
                    </Button>
                  )}
                </div>
              </section>
            )}

            {activeComponent && (
              <ComponentPanel
                component={activeComponent}
                canWrite={canWrite}
                activeStage={activeStage}
                onUpload={async (kind, file) => {
                  try {
                    await uploadArtwork.mutateAsync({
                      componentSlug: activeComponent.slug,
                      kind,
                      file,
                    })
                    toast({ title: 'Artwork uploaded', description: 'Plates extracted when applicable.' })
                    setActiveStage('plates')
                  } catch (e) {
                    toast({
                      title: 'Upload failed',
                      description: e instanceof Error ? e.message : '',
                      variant: 'destructive',
                    })
                  }
                }}
                uploadPending={uploadArtwork.isPending}
                onGenerateSupplier={async () => {
                  try {
                    await genSupplier.mutateAsync(activeComponent.id)
                    toast({ title: 'Supplier PDF generated' })
                  } catch (e) {
                    toast({
                      title: 'Supplier PDF failed',
                      description: e instanceof Error ? e.message : '',
                      variant: 'destructive',
                    })
                  }
                }}
                supplierPending={genSupplier.isPending}
                onSpecChange={(specs) => {
                  void updateSpecs.mutateAsync({ componentId: activeComponent.id, specs })
                }}
              />
            )}
          </main>
        </div>
      )}

      <PackagingImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(id) => {
          setActivePacketId(id)
          setActiveStage('artwork')
        }}
      />
      <PackagingMaterialsDialog open={materialsOpen} onOpenChange={setMaterialsOpen} />
    </div>
  )
}

function ComponentPanel({
  component,
  canWrite,
  activeStage,
  onUpload,
  uploadPending,
  onGenerateSupplier,
  supplierPending,
  onSpecChange,
}: {
  component: PackagingComponent
  canWrite: boolean
  activeStage: PackagingStageKey
  onUpload: (kind: string, file: File) => Promise<void>
  uploadPending: boolean
  onGenerateSupplier: () => Promise<void>
  supplierPending: boolean
  onSpecChange: (specs: Record<string, string>) => void
}) {
  const specs = component.specs ?? {}
  const editableArt = component.artworks.find((a) =>
    a.fileName.toLowerCase().includes('editable')
  )
  const plates = editableArt?.extractedPlates

  return (
    <section className="rounded-xl border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{component.displayName}</h2>
        {component.supplierPdfUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={component.supplierPdfUrl} target="_blank" rel="noreferrer">
              <FileText className="h-4 w-4 mr-2" />
              Supplier PDF
            </a>
          </Button>
        )}
      </div>

      {(activeStage === 'workbook' || activeStage === 'review') && (
        <div className="grid gap-3 sm:grid-cols-2">
          {SPEC_FIELDS.map((field) => (
            <label key={field} className="space-y-1">
              <span className="text-xs text-muted-foreground">{field}</span>
              <input
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={specs[field] ?? ''}
                disabled={!canWrite}
                onChange={(e) => onSpecChange({ ...specs, [field]: e.target.value })}
              />
            </label>
          ))}
        </div>
      )}

      {(activeStage === 'artwork' || activeStage === 'review') && canWrite && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Upload editable .ai</p>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept=".ai,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUpload('Artwork', f)
              }}
            />
            <Button variant="outline" size="sm" disabled={uploadPending} asChild>
              <span>
                {uploadPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Choose file
              </span>
            </Button>
          </label>
          {component.artworks.map((a) => (
            <p key={a.id} className="text-xs text-muted-foreground">
              {a.fileName} ({a.kind})
            </p>
          ))}
        </div>
      )}

      {(activeStage === 'plates' || activeStage === 'review') && plates && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Extracted plates</p>
          <PlateList title="Inks" items={plates.inks ?? []} mismatches={editableArt?.mismatchedMaterialIds ?? []} />
          <PlateList title="Finishes" items={plates.finishes ?? []} mismatches={editableArt?.mismatchedMaterialIds ?? []} />
          <PlateList title="Dielines" items={plates.dielines ?? []} mismatches={[]} />
        </div>
      )}

      {(activeStage === 'export' || activeStage === 'review') && canWrite && (
        <Button disabled={supplierPending || !editableArt} onClick={() => void onGenerateSupplier()}>
          {supplierPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Generate supplier PDF (Option A overlay)
        </Button>
      )}
    </section>
  )
}

function PlateList({
  title,
  items,
  mismatches,
}: {
  title: string
  items: string[]
  mismatches: string[]
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <ul className="flex flex-wrap gap-1">
        {items.map((p) => {
          const bad = mismatches.includes(p)
          return (
            <li
              key={p}
              className={cn(
                'text-xs rounded-full px-2 py-0.5 border',
                bad ? 'border-destructive/50 text-destructive bg-destructive/5' : 'border-border'
              )}
            >
              {p}
              {bad && ' · not approved'}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
