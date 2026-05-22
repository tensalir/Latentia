'use client'

import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useImportPackagingWorkbook } from '@/hooks/usePackaging'
import { Loader2, Upload, Download } from 'lucide-react'

export function PackagingImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (packetId: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const importMutation = useImportPackagingWorkbook()
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const result = await importMutation.mutateAsync(fd)
      onImported(result.packet.id)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Creative Intent workbook</DialogTitle>
          <DialogDescription>
            Upload the Loop Packaging Excel workbook. Vesper creates a packet with all component tabs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          <Button
            className="w-full"
            disabled={importMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {importMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Choose .xlsx file
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <a href="/api/packaging/template" download>
              <Download className="h-4 w-4 mr-2" />
              Download empty template
            </a>
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
