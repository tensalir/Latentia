'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Image as ImageIcon, Video, Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Session } from '@/types/project'

interface FloatingSessionBarProps {
  sessions: Session[]
  activeSession: Session | null
  generationType: 'image' | 'video'
  onSessionSelect: (session: Session) => void
  onSessionCreate: (type: 'image' | 'video') => void
  onSessionRename?: (session: Session) => void
  onSessionDelete?: (session: Session) => void
}

interface SessionThumbnail {
  sessionId: string
  imageUrl: string | null
  isLoading: boolean
}

export function FloatingSessionBar({
  sessions,
  activeSession,
  generationType,
  onSessionSelect,
  onSessionCreate,
  onSessionRename,
  onSessionDelete,
}: FloatingSessionBarProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, SessionThumbnail>>({})
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)

  const filteredSessions = useMemo(
    () => sessions.filter((s) => s.type === generationType),
    [sessions, generationType]
  )
  
  // Create a stable dependency key for filtered sessions
  const filteredSessionIds = useMemo(
    () => filteredSessions.map(s => s.id).join(','),
    [filteredSessions]
  )

  // Fetch latest image for each session
  useEffect(() => {
    const fetchThumbnails = async () => {
      for (const session of filteredSessions) {
        // Check if we already have this thumbnail (using functional update to avoid stale closure)
        setThumbnails(prev => {
          if (prev[session.id]?.imageUrl !== undefined) return prev // Already fetched
          return {
            ...prev,
            [session.id]: { sessionId: session.id, imageUrl: null, isLoading: true }
          }
        })
      }
      
      // Fetch thumbnails for sessions that need them
      for (const session of filteredSessions) {
        try {
          const response = await fetch(`/api/generations?sessionId=${session.id}&limit=1`)
          if (response.ok) {
            const data = await response.json()
            const generations = data.data || data || []
            const latestGen = generations[0]
            const latestOutput = latestGen?.outputs?.[0]
            
            setThumbnails(prev => ({
              ...prev,
              [session.id]: {
                sessionId: session.id,
                imageUrl: latestOutput?.fileUrl || null,
                isLoading: false
              }
            }))
          }
        } catch (error) {
          console.error('Error fetching thumbnail for session:', session.id, error)
          setThumbnails(prev => ({
            ...prev,
            [session.id]: { sessionId: session.id, imageUrl: null, isLoading: false }
          }))
        }
      }
    }

    fetchThumbnails()
  }, [filteredSessionIds, filteredSessions])

  return (
    <div className="flex flex-col items-start gap-3">
      {/* New Session Button */}
      <button
        onClick={() => onSessionCreate(generationType)}
        className="w-14 h-14 rounded-2xl bg-card/90 backdrop-blur-lg border border-border/50 shadow-lg
          flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50
          transition-all duration-300"
        title={`New ${generationType} session`}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Divider */}
      {filteredSessions.length > 0 && (
        <div className="w-8 h-px bg-border/50 ml-3" />
      )}

      {/* Session Thumbnails */}
      <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto scrollbar-hide py-1">
        {filteredSessions.map((session) => {
          const thumbnail = thumbnails[session.id]
          const isActive = activeSession?.id === session.id
          const isHovered = hoveredSession === session.id

          return (
            <div
              key={session.id}
              className="relative"
              onMouseEnter={() => setHoveredSession(session.id)}
              onMouseLeave={() => setHoveredSession(null)}
            >
              {/* Fluid Expandable Session Card */}
              <div
                className={`
                  relative rounded-2xl overflow-hidden
                  border-2 shadow-lg backdrop-blur-lg
                  transition-all duration-300 ease-out
                  ${isActive 
                    ? 'border-primary ring-2 ring-primary/30' 
                    : 'border-border/50 hover:border-primary/50'
                  }
                `}
                style={{
                  width: isHovered ? '220px' : '56px',
                  height: isHovered ? '80px' : '56px',
                }}
              >
                {/* Background - thumbnail or placeholder */}
                <div className="absolute inset-0">
                  {thumbnail?.isLoading ? (
                    <div className="w-full h-full bg-card/95 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                    </div>
                  ) : thumbnail?.imageUrl ? (
                    <>
                      <img
                        src={thumbnail.imageUrl}
                        alt={session.name}
                        className="w-full h-full object-cover"
                      />
                      {/* Gradient overlay for text readability when expanded */}
                      <div 
                        className="absolute inset-0 transition-opacity duration-300"
                        style={{
                          background: isHovered 
                            ? 'linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%)'
                            : 'none',
                          opacity: isHovered ? 1 : 0,
                        }}
                      />
                    </>
                  ) : (
                    <div className="w-full h-full bg-card/95 flex items-center justify-center">
                      {session.type === 'video' ? (
                        <Video className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </div>

                {/* Content Layer */}
                <button
                  onClick={() => onSessionSelect(session)}
                  className="relative w-full h-full flex items-center cursor-pointer"
                >
                  {/* Session info - visible when expanded */}
                  <div 
                    className="flex flex-col items-start justify-center px-4 transition-opacity duration-200"
                    style={{
                      opacity: isHovered ? 1 : 0,
                      pointerEvents: isHovered ? 'auto' : 'none',
                    }}
                  >
                    <span className="text-sm font-semibold text-white whitespace-nowrap drop-shadow-md">
                      {session.name}
                    </span>
                    {session.creator?.displayName && (
                      <span className="text-xs text-white/70 whitespace-nowrap drop-shadow-md">
                        {session.creator.displayName}
                      </span>
                    )}
                  </div>
                </button>

                {/* Action buttons - visible when expanded */}
                <div 
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 transition-opacity duration-200"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    pointerEvents: isHovered ? 'auto' : 'none',
                  }}
                >
                  {onSessionRename && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSessionRename(session)
                      }}
                      className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                      title="Rename session"
                    >
                      <Pencil className="h-3.5 w-3.5 text-white" />
                    </button>
                  )}
                  {onSessionDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSessionDelete(session)
                      }}
                      className="p-1.5 rounded-lg bg-white/20 hover:bg-red-500/80 transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-white" />
                    </button>
                  )}
                </div>

                {/* Active indicator dot */}
                {isActive && !isHovered && (
                  <div className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-primary shadow-lg" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredSessions.length === 0 && (
        <div className="w-14 h-14 rounded-2xl bg-card/50 border border-dashed border-border/50 
          flex items-center justify-center">
          <span className="text-xs text-muted-foreground">—</span>
        </div>
      )}
    </div>
  )
}

