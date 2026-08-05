'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Lock, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActivePackagingSelection } from '@/hooks/useActivePackagingSelection'
import { usePackagingPacket, usePackagingProjects } from '@/hooks/usePackaging'
import { usePackagingPermissions } from '@/hooks/usePackagingPermissions'
import { PackagingPipelineHeader, type PackagingStep } from './PackagingPipelineHeader'
import { PackagingStatusBadge } from './PackagingStatusBadge'
import { ProjectsRail } from './ProjectsRail'
import { PacketSwitcher } from './PacketSwitcher'
import { ProjectInfoCard } from './ProjectInfoCard'
import { ComponentLibraryDialog } from './ComponentLibraryDialog'
import { ProductSetupPanel } from './ProductSetupPanel'
import { ComponentPager } from './ComponentPager'
import { ComponentSpecForm } from './ComponentSpecForm'
import { ComponentArtworkPanel } from './ComponentArtworkPanel'
import { PackInstructionsEditor } from './PackInstructionsEditor'
import { GeneratePanel } from './GeneratePanel'
import { WorkbookDialog } from './WorkbookDialog'
import { ActivityButton, PackagingActivityDrawer } from './PackagingActivityDrawer'

/**
 * Packaging Studio shell. Thin on purpose: it owns which step is showing and
 * hands the work to one panel per screen (the CMF workspace convention).
 */
export function PackagingWorkspace({
  initialProjectId,
  initialPacketId,
  initialComponentId,
}: {
  initialProjectId: string | null
  initialPacketId: string | null
  initialComponentId: string | null
}) {
  const { canWrite, isLoading: permissionsLoading } = usePackagingPermissions()
  const selection = useActivePackagingSelection({
    projectId: initialProjectId,
    packetId: initialPacketId,
    componentId: initialComponentId,
  })
  const { data: projects = [], isLoading: projectsLoading } = usePackagingProjects()
  const { data: packetData } = usePackagingPacket(selection.packetId)
  const [step, setStep] = useState<PackagingStep>(initialPacketId ? 'components' : 'project')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [workbookOpen, setWorkbookOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selection.projectId) ?? null,
    [projects, selection.projectId]
  )
  const packet = packetData?.packet ?? null
  const readiness = packetData?.readiness ?? null
  // Memoised so the pager's `useMemo` below doesn't see a new array every render.
  const components = useMemo(() => packet?.components ?? [], [packet])

  // Keep the pager pointed at something real as components come and go.
  const activeComponent = useMemo(
    () => components.find((c) => c.id === selection.componentId) ?? components[0] ?? null,
    [components, selection.componentId]
  )
  useEffect(() => {
    if (activeComponent && activeComponent.id !== selection.componentId) {
      selection.selectComponent(activeComponent.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeComponent?.id])

  // Steps past "Info" need a packet to act on.
  const disabledFrom = selection.packetId ? undefined : 2

  // At-a-glance progress per step, so "what's left" is answerable without
  // clicking through. Amber means worth a look, never blocked.
  const progress = useMemo(() => {
    if (!packet || !readiness) return undefined
    const project = packet.project
    const componentsWithArtwork = readiness.components.filter((c) => c.hasArtwork).length
    const missingSpecs = readiness.components.some((c) => c.missingSpecs.length > 0)
    const generated = packet.components.some((c) => c.supplierPdfUrl)
    return {
      project: { done: true },
      info: {
        done: Boolean(project.supplier && project.packagingDesignerName && project.graphicDesignerName),
        attention: !project.supplier || !project.packagingDesignerName,
        hint: 'Supplier and the three designer names print on every supplier brief.',
      },
      library: {
        done: components.length > 0,
        attention: components.length === 0,
        hint: `${components.length} component(s) selected.`,
      },
      setup: {
        done: components.length > 0 && components.some((c) => c.includeInCreativeIntent),
        hint: 'Include toggles and page order.',
      },
      components: {
        done: componentsWithArtwork === components.length && !missingSpecs && components.length > 0,
        attention: componentsWithArtwork < components.length || missingSpecs,
        hint: `${componentsWithArtwork}/${components.length} have artwork${missingSpecs ? '; some specs are empty' : ''}.`,
      },
      generate: {
        done: generated && packet.status === 'ready',
        attention: readiness.warnings.length > 0,
        hint:
          readiness.warnings.length > 0
            ? `${readiness.warnings.length} thing(s) worth checking first.`
            : 'Ready to generate.',
      },
    }
  }, [packet, readiness, components])

  const openComponent = (componentId: string) => {
    selection.selectComponent(componentId)
    setStep('components')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Loop · Packaging
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {packet ? packet.project.name : 'Packaging Studio'}
          </h1>
          {packet && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{packet.stage}</span>
              <span>·</span>
              <span>{packet.variant}</span>
              <PackagingStatusBadge status={packet.status} />
            </span>
          )}
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
          One source of truth for a packaging handover: specs filled together, inks and plates read
          straight from the artwork, supplier briefs and the Creative Intent generated from the same
          data.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PackagingPipelineHeader
          active={step}
          onSelect={setStep}
          disabledFrom={disabledFrom}
          progress={progress}
        />
        <div className="flex items-center gap-2">
          {/* Without this, a read-only visitor sees disabled fields and a
              missing "+" and reads the tool as broken rather than locked. */}
          {!canWrite && !permissionsLoading && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              title="Packaging write access is required to create projects, fill specs, upload artwork or generate. Ask an admin to grant it from User Management."
            >
              <Lock className="h-3 w-3" />
              Read-only · request packaging write from admin
            </span>
          )}
          {packet && (
            <>
              <ActivityButton onClick={() => setActivityOpen(true)} />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setWorkbookOpen(true)}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel workbook
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <ProjectsRail
          projects={projects}
          activeProjectId={selection.projectId}
          onSelect={(id) => {
            selection.selectProject(id)
            setStep('info')
          }}
          canWrite={canWrite}
          isLoading={projectsLoading}
        />

        <div className="min-w-0 flex-1 space-y-6">
          {!activeProject ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-card/20 p-12 text-center">
              <Package className="mx-auto h-9 w-9 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                {canWrite ? 'Pick a project to begin, or create one.' : 'Pick a project to begin.'}
              </p>
            </div>
          ) : (
            <>
              {(step === 'project' || step === 'info') && (
                <div className="space-y-6">
                  <PacketSwitcher
                    project={activeProject}
                    activePacketId={selection.packetId}
                    onSelect={(id) => {
                      selection.selectPacket(id)
                      setStep('library')
                    }}
                    canWrite={canWrite}
                  />
                  <ProjectInfoCard project={activeProject} canWrite={canWrite} />
                </div>
              )}

              {step === 'library' && packet && (
                <div className="space-y-4">
                  <ProductSetupPanel
                    packetId={packet.id}
                    components={components}
                    canWrite={canWrite}
                    onOpenLibrary={() => setLibraryOpen(true)}
                    onOpenComponent={openComponent}
                  />
                  {components.length > 0 && canWrite && (
                    <p className="text-xs text-muted-foreground">
                      Happy with the selection? Move on to Setup to set the page order.
                    </p>
                  )}
                </div>
              )}

              {step === 'setup' && packet && (
                <ProductSetupPanel
                  packetId={packet.id}
                  components={components}
                  canWrite={canWrite}
                  onOpenLibrary={() => setLibraryOpen(true)}
                  onOpenComponent={openComponent}
                />
              )}

              {step === 'components' && packet && (
                <div className="space-y-5">
                  {components.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 bg-card/20 p-10 text-center text-sm text-muted-foreground">
                      No components on this packet yet — pick them from the library first.
                    </div>
                  ) : (
                    <>
                      <ComponentPager
                        components={components}
                        activeComponentId={activeComponent?.id ?? null}
                        onSelect={(id) => selection.selectComponent(id)}
                      />
                      {activeComponent && (
                        <div className="space-y-5">
                          <ComponentSpecForm
                            packetId={packet.id}
                            component={activeComponent}
                            canWrite={canWrite}
                          />
                          <ComponentArtworkPanel
                            packetId={packet.id}
                            component={activeComponent}
                            canWrite={canWrite}
                          />
                          <PackInstructionsEditor
                            packetId={packet.id}
                            component={activeComponent}
                            canWrite={canWrite}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {step === 'generate' && packet && readiness && (
                <GeneratePanel packet={packet} readiness={readiness} canWrite={canWrite} />
              )}

              {step !== 'project' && step !== 'info' && !packet && (
                <div className="rounded-2xl border border-dashed border-border/50 bg-card/20 p-10 text-center text-sm text-muted-foreground">
                  Select or create a packet (stage + colourway) to continue.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {packet && (
        <>
          <ComponentLibraryDialog
            open={libraryOpen}
            onOpenChange={setLibraryOpen}
            packetId={packet.id}
            selected={components}
            canWrite={canWrite}
          />
          <WorkbookDialog
            open={workbookOpen}
            onOpenChange={setWorkbookOpen}
            packet={packet}
            canWrite={canWrite}
          />
          <PackagingActivityDrawer
            open={activityOpen}
            onOpenChange={setActivityOpen}
            packetId={packet.id}
          />
        </>
      )}
    </div>
  )
}
