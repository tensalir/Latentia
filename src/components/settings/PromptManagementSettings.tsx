'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Edit, Save, X } from 'lucide-react'

interface EnhancementPrompt {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  isActive: boolean
  modelIds: string[]
  createdAt: string
  updatedAt: string
}

export function PromptManagementSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [prompts, setPrompts] = useState<EnhancementPrompt[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedPrompt, setEditedPrompt] = useState<Partial<EnhancementPrompt>>({})
  // Single-prompt admin UX: no creation flow for now

  useEffect(() => {
    fetchPrompts()
  }, [])

  const fetchPrompts = async () => {
    try {
      setFetching(true)
      const response = await fetch('/api/admin/prompt-enhancements')
      if (!response.ok) throw new Error('Failed to fetch prompts')
      const data = await response.json()
      setPrompts(data)
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: 'Error',
        description: 'Failed to load enhancement prompts',
        variant: 'destructive',
      })
    } finally {
      setFetching(false)
    }
  }

  // Save edits for the currently edited prompt
  const handleSave = async () => {
    if (!editingId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/prompt-enhancements/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedPrompt),
      })
      if (!response.ok) throw new Error('Failed to save')
      toast({ title: 'Saved', description: 'System prompt updated' })
      setEditingId(null)
      setEditedPrompt({})
      await fetchPrompts()
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save changes', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prompt?')) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/prompt-enhancements/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete')
      toast({ title: 'Success', description: 'Prompt deleted' })
      await fetchPrompts()
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Prompt Enhancement</CardTitle>
            <CardDescription>Edit the system prompt used for AI prompt enhancement</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {prompts.map((prompt) => (
            <Card key={prompt.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{prompt.name}</CardTitle>
                      {prompt.isActive && <Badge>Active</Badge>}
                    </div>
                    <CardDescription>{prompt.description || 'No description'}</CardDescription>
                  </div>
                  {editingId === prompt.id ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSave} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditedPrompt({}) }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(prompt.id); setEditedPrompt({ name: prompt.name, description: prompt.description || '', systemPrompt: prompt.systemPrompt }) }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              {editingId === prompt.id ? (
                <CardContent className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={editedPrompt.name || ''}
                      onChange={(e) => setEditedPrompt({ ...editedPrompt, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={editedPrompt.description || ''}
                      onChange={(e) => setEditedPrompt({ ...editedPrompt, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>System Prompt</Label>
                    <Textarea
                      value={editedPrompt.systemPrompt || ''}
                      onChange={(e) => setEditedPrompt({ ...editedPrompt, systemPrompt: e.target.value })}
                      rows={16}
                      className="font-mono text-sm"
                    />
                  </div>
                </CardContent>
              ) : (
                <CardContent>
                  <div className="rounded-lg bg-muted p-4">
                    <pre className="text-sm whitespace-pre-wrap font-mono">{prompt.systemPrompt}</pre>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {prompts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No system prompt configured yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
