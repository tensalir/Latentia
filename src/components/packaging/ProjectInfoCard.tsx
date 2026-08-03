'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUpdatePackagingProject, type PackagingProject } from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'

/**
 * Screen 2: everything about the project in one place — what it is, who is on
 * it, who supplies it, and where the files live. The file link matters for
 * people outside the team: "someone external would click that and be like,
 * where are the files here?"
 *
 * Read-only for anyone without packaging write access.
 */

const FIELDS = [
  { key: 'productType', label: 'Product type', placeholder: 'Sleep Mask' },
  { key: 'productFamily', label: 'Product family', placeholder: 'Sleep' },
  { key: 'supplier', label: 'Supplier', placeholder: 'Supplier name' },
  { key: 'internalRef', label: 'Internal reference', placeholder: 'A120' },
  { key: 'packagingDesignerName', label: 'Packaging designer', placeholder: 'Structural designer' },
  { key: 'graphicDesignerName', label: 'Graphic designer', placeholder: 'Name' },
  { key: 'packagingEngineerName', label: 'Packaging engineer', placeholder: 'Name' },
] as const

type FieldKey = (typeof FIELDS)[number]['key'] | 'fileLocationUrl' | 'notes'

const AUTOSAVE_DELAY_MS = 700

export function ProjectInfoCard({
  project,
  canWrite,
}: {
  project: PackagingProject
  canWrite: boolean
}) {
  const update = useUpdatePackagingProject(project.id)
  const { toast } = useToast()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Re-sync when the project switches; keep local edits otherwise.
  useEffect(() => {
    setDraft({})
  }, [project.id])

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout)
    },
    []
  )

  const valueOf = (key: FieldKey): string =>
    draft[key] ?? ((project as unknown as Record<string, string | null>)[key] ?? '')

  // Debounced autosave — v1 fired a PATCH per keystroke.
  const edit = (key: FieldKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      update.mutate(
        { [key]: value.trim() || null } as Partial<PackagingProject>,
        {
          onError: (err) =>
            toast({
              title: 'Could not save',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'destructive',
            }),
        }
      )
    }, AUTOSAVE_DELAY_MS)
  }

  if (!canWrite) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-5">
        <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {field.label}
              </dt>
              <dd className="mt-1 text-sm">{valueOf(field.key) || '—'}</dd>
            </div>
          ))}
        </dl>
        {project.fileLocationUrl && (
          <a
            href={project.fileLocationUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2 transition-all"
          >
            Where the files live
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Saved automatically. These names print on every supplier brief.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`project-${field.key}`} className="text-xs">
              {field.label}
            </Label>
            <Input
              id={`project-${field.key}`}
              value={valueOf(field.key)}
              placeholder={field.placeholder}
              onChange={(e) => edit(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-files" className="text-xs">
          Where the files live
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="project-files"
            value={valueOf('fileLocationUrl')}
            placeholder="https://drive.google.com/…"
            onChange={(e) => edit('fileLocationUrl', e.target.value)}
          />
          {project.fileLocationUrl && (
            <a
              href={project.fileLocationUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md border border-border/60 p-2 text-muted-foreground hover:text-primary"
              aria-label="Open file location"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Anyone with a Vesper account can read this — that&apos;s the point.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-notes" className="text-xs">
          Notes
        </Label>
        <Textarea
          id="project-notes"
          rows={3}
          value={valueOf('notes')}
          onChange={(e) => edit('notes', e.target.value)}
        />
      </div>
    </div>
  )
}
