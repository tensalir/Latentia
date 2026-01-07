'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Bookmark as BookmarkIcon } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface BookmarkedItem {
  id: string
  createdAt: string
  output: {
    id: string
    fileUrl: string
    fileType: string
    generation: {
      id: string
      prompt: string
      modelId: string
      session: {
        id: string
        name: string
        project: {
          id: string
          name: string
        }
      }
    }
  }
}

export default function BookmarksPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [bookmarks, setBookmarks] = useState<BookmarkedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBookmarks()
  }, [])

  const fetchBookmarks = async () => {
    try {
      const response = await fetch('/api/bookmarks')
      if (response.ok) {
        const data = await response.json()
        setBookmarks(data)
      } else {
        throw new Error('Failed to fetch bookmarks')
      }
    } catch (error) {
      console.error('Error fetching bookmarks:', error)
      toast({
        title: 'Error',
        description: 'Failed to load bookmarks',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenSession = (projectId: string, sessionId: string) => {
    router.push(`/projects/${projectId}?sessionId=${sessionId}`)
  }

  const handleRemoveBookmark = async (outputId: string) => {
    try {
      const response = await fetch('/api/bookmarks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId }),
      })

      if (response.ok) {
        toast({
          title: 'Bookmark removed',
          description: 'Item removed from bookmarks',
          variant: 'default',
        })
        setBookmarks(bookmarks.filter(b => b.output.id !== outputId))
      } else {
        throw new Error('Failed to remove bookmark')
      }
    } catch (error) {
      console.error('Error removing bookmark:', error)
      toast({
        title: 'Error',
        description: 'Failed to remove bookmark',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading bookmarks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bookmarks</h1>
        <p className="text-muted-foreground">
          {bookmarks.length} {bookmarks.length === 1 ? 'item' : 'items'} bookmarked
        </p>
      </div>

      {/* Content */}
      {bookmarks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <BookmarkIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">No bookmarks yet</h2>
            <p className="text-muted-foreground mb-6">
              Bookmark your favorite generations to find them easily
            </p>
            <Button onClick={() => router.push('/projects')}>
              Browse Projects
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-all hover:border-primary/50"
            >
              {/* Image */}
              <div
                className="aspect-square cursor-pointer relative"
                onClick={() =>
                  handleOpenSession(
                    bookmark.output.generation.session.project.id,
                    bookmark.output.generation.session.id
                  )
                }
              >
                {bookmark.output.fileType === 'image' ? (
                  <img
                    src={bookmark.output.fileUrl}
                    alt="Bookmarked content"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={bookmark.output.fileUrl}
                    className="w-full h-full object-cover"
                  />
                )}
                
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <p className="text-white text-sm font-medium px-4 text-center">
                    Open in {bookmark.output.generation.session.name}
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="p-4 space-y-2">
                <p className="text-sm font-medium line-clamp-2">
                  {bookmark.output.generation.prompt}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    {bookmark.output.generation.session.project.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveBookmark(bookmark.output.id)
                    }}
                    className="h-7 px-2"
                  >
                    <BookmarkIcon className="h-3.5 w-3.5 fill-current" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

