'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  useUpdatePackSteps,
  useUploadStepImage,
  type PackagingComponent,
} from '@/hooks/usePackaging'
import { useToast } from '@/components/ui/use-toast'

/**
 * Pack instructions — Anna's example verbatim: "if I say Step 1, Step 2, Step 3,
 * Step 4, I can put a picture here and I can put some information so it will
 * appear on the Creative Intent to say 'hold it right in the middle and stick
 * it in the middle'."
 *
 * This is why a non-printed component (tissue paper) still earns a page.
 */

interface DraftStep {
  instruction: string
  imagePath: string | null
  imageFileName: string | null
  imageUrl: string | null
}

export function PackInstructionsEditor({
  packetId,
  component,
  canWrite,
}: {
  packetId: string
  component: PackagingComponent
  canWrite: boolean
}) {
  const save = useUpdatePackSteps(packetId)
  const upload = useUploadStepImage(packetId)
  const { toast } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<number | null>(null)
  const [steps, setSteps] = useState<DraftStep[]>([])

  // Adopt server state whenever the component changes (or its steps do).
  useEffect(() => {
    setSteps(
      component.packSteps.map((step) => ({
        instruction: step.instruction,
        imagePath: step.imagePath,
        imageFileName: step.imageFileName,
        imageUrl: step.imageUrl,
      }))
    )
  }, [component.id, component.packSteps])

  const persist = (next: DraftStep[]) => {
    setSteps(next)
    save.mutate(
      {
        componentId: component.id,
        steps: next
          .filter((s) => s.instruction.trim())
          .map((s) => ({
            instruction: s.instruction.trim(),
            imagePath: s.imagePath,
            imageFileName: s.imageFileName,
          })),
      },
      {
        onError: (err) =>
          toast({
            title: 'Could not save pack instructions',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          }),
      }
    )
  }

  const edit = (index: number, instruction: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, instruction } : s)))
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  const attachImage = async (file: File, index: number) => {
    try {
      const { path, fileName } = await upload.mutateAsync({
        file,
        packetComponentId: component.id,
      })
      // The path belongs to the step, not to an artwork row — persist it with
      // the step list so the Creative Intent can embed it.
      persist(
        steps.map((s, i) =>
          i === index ? { ...s, imagePath: path, imageFileName: fileName, imageUrl: null } : s
        )
      )
      toast({ title: 'Step image attached' })
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setUploadTarget(null)
    }
  }

  if (!canWrite && steps.length === 0) return null

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Pack instructions
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ordered steps for the supplier. They print on this component&apos;s Creative Intent page.
          </p>
        </div>
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={() =>
              persist([...steps, { instruction: '', imagePath: null, imageFileName: null, imageUrl: null }])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add step
          </Button>
        )}
      </div>

      {steps.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">
          No steps yet. Add one if the supplier needs to be told how this part is packed.
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/25 p-3"
            >
              <span className="mt-1.5 w-5 shrink-0 font-mono text-xs text-muted-foreground">
                {index + 1}.
              </span>

              <div className="min-w-0 flex-1 space-y-2">
                <Textarea
                  rows={2}
                  value={step.instruction}
                  disabled={!canWrite}
                  placeholder="Hold it right in the middle and stick it in the middle."
                  onChange={(e) => edit(index, e.target.value)}
                  onBlur={() => persist(steps)}
                  className="text-sm"
                />
                {step.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={step.imageUrl}
                    alt={step.imageFileName ?? `Step ${index + 1}`}
                    className="max-h-24 rounded-md border border-border/50"
                  />
                ) : (
                  step.imageFileName && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {step.imageFileName} (referenced in the workbook; upload the file to show it)
                    </p>
                  )
                )}
              </div>

              {canWrite && (
                <div className="flex shrink-0 flex-col gap-1">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move step up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move step down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('h-7 w-7 p-0', upload.isPending && 'opacity-50')}
                      disabled={upload.isPending}
                      onClick={() => {
                        setUploadTarget(index)
                        fileInput.current?.click()
                      }}
                      aria-label="Attach an image to this step"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => persist(steps.filter((_, i) => i !== index))}
                      aria-label="Delete step"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadTarget !== null) void attachImage(file, uploadTarget)
          e.target.value = ''
        }}
      />
    </div>
  )
}
