'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Video } from 'lucide-react'
import type { Session } from '@/types/project'

interface VideoSessionSelectorProps {
  isOpen: boolean
  onClose: () => void
  videoSessions: Session[]
  onSelectSession: (sessionId: string) => void
  onCreateNewSession: (sessionName: string) => void
}

export function VideoSessionSelector({
  isOpen,
  onClose,
  videoSessions,
  onSelectSession,
  onCreateNewSession,
}: VideoSessionSelectorProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select')
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [newSessionName, setNewSessionName] = useState('')

  const handleSubmit = () => {
    if (mode === 'select' && selectedSessionId) {
      onSelectSession(selectedSessionId)
      onClose()
      resetForm()
    } else if (mode === 'create' && newSessionName.trim()) {
      onCreateNewSession(newSessionName.trim())
      onClose()
      resetForm()
    }
  }

  const resetForm = () => {
    setMode('select')
    setSelectedSessionId('')
    setNewSessionName('')
  }

  const handleClose = () => {
    onClose()
    resetForm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Convert to Video
          </DialogTitle>
          <DialogDescription>
            Select an existing video session or create a new one. The prompt and parameters will be copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode Selector */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'select' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setMode('select')}
              disabled={videoSessions.length === 0}
            >
              Select Existing
            </Button>
            <Button
              type="button"
              variant={mode === 'create' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setMode('create')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New
            </Button>
          </div>

          {/* Select Mode */}
          {mode === 'select' && (
            <div className="space-y-2">
              <Label>Select Video Session</Label>
              {videoSessions.length > 0 ? (
                <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a session..." />
                  </SelectTrigger>
                  <SelectContent>
                    {videoSessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>
                        <div className="flex items-center gap-2">
                          <Video className="h-3.5 w-3.5" />
                          <span>{session.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  No video sessions available. Create a new one instead.
                </p>
              )}
            </div>
          )}

          {/* Create Mode */}
          {mode === 'create' && (
            <div className="space-y-2">
              <Label htmlFor="sessionName">New Session Name</Label>
              <Input
                id="sessionName"
                placeholder="e.g., Product Video 1"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit()
                  }
                }}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              (mode === 'select' && !selectedSessionId) ||
              (mode === 'create' && !newSessionName.trim())
            }
          >
            {mode === 'select' ? 'Use This Session' : 'Create & Use'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

