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
import { cn } from '@/lib/utils'
import { useCreatePackagingProject, type PackagingProjectWithPackets } from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'

/** Screen 1: pick the project you're working on (Aphrodite, Hebe…). */
export function ProjectsRail({
  projects,
  activeProjectId,
  onSelect,
  canWrite,
  isLoading,
}: {
  projects: PackagingProjectWithPackets[]
  activeProjectId: string | null
  onSelect: (id: string) => void
  canWrite: boolean
  isLoading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [productType, setProductType] = useState('')
  const createProject = useCreatePackagingProject()
  const { toast } = useToast()

  const submit = async () => {
    if (!name.trim()) return
    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        productType: productType.trim() || null,
      })
      setOpen(false)
      setName('')
      setProductType('')
      onSelect(project.id)
    } catch (err) {
      toast({
        title: 'Could not create project',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <aside className="w-full lg:w-72 shrink-0 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Projects
        </p>
        {/* Shown disabled rather than hidden: a missing button reads as a
            broken tool, a greyed one reads as "not mine to press". The title
            sits on the wrapper because a disabled button fires no hover. */}
        <span
          title={
            canWrite
              ? 'New packaging project'
              : 'Packaging write access required — ask an admin to grant it from User Management.'
          }
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={!canWrite}
            className={cn('h-7 px-2', !canWrite && 'opacity-60 cursor-not-allowed')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-border/40 bg-card/20 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-card/20 p-4 text-sm text-muted-foreground">
          No projects yet.
          {canWrite && ' Create one to start a packaging handover.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId
            return (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => onSelect(project.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-all',
                    isActive
                      ? 'border-primary/50 bg-card/60'
                      : 'border-border/50 bg-card/30 hover:border-primary/30 hover:bg-card/50'
                  )}
                >
                  <p className="text-sm font-medium leading-tight">{project.name}</p>
                  {project.productType && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{project.productType}</p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {project.packets.length === 0
                      ? 'No packets yet'
                      : `${project.packets.length} packet${project.packets.length === 1 ? '' : 's'}`}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New packaging project</DialogTitle>
            <DialogDescription>
              One project per product. Stages and colourways become packets inside it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aphrodite"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-type">Product type</Label>
              <Input
                id="project-type"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                placeholder="Sleep Mask"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim() || createProject.isPending}>
              {createProject.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
