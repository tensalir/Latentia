'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjects } from '@/hooks/useProjects'
import { useApprovedOutputs } from '@/hooks/useApprovedOutputs'
import { useRecentOutputs } from '@/hooks/useRecentOutputs'
import { NewProjectDialog } from '@/components/projects/NewProjectDialog'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { useQueryClient } from '@tanstack/react-query'
import type { Project } from '@/types/project'
import {
  Plus,
  FolderKanban,
  CheckCircle,
  Bookmark,
  ArrowRight,
  Sparkles,
  Play,
  ImageIcon,
  Clock,
} from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showNewProject, setShowNewProject] = useState(false)
  
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: approvedOutputs = [] } = useApprovedOutputs()
  const { data: recentOutputs = [], isLoading: recentLoading } = useRecentOutputs(12)
  
  // Get the 3 most recent projects
  const recentProjects = projects.slice(0, 3)
  const hasProjects = projects.length > 0

  const handleProjectCreated = (project: Project) => {
    queryClient.setQueryData(['projects'], (oldData: (Project & { thumbnailUrl?: string | null })[] | undefined) => {
      if (!oldData) return [project]
      return [{ ...project, thumbnailUrl: null }, ...oldData]
    })
    setShowNewProject(false)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    router.push(`/projects/${project.id}`)
  }

  const handleProjectUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back. Here&apos;s an overview of your creative workspace.
        </p>
      </div>

      {/* Quick Actions - Simplified horizontal layout */}
      <div className="flex flex-wrap gap-2">
        <Button 
          variant="default"
          className="gap-2"
          onClick={() => setShowNewProject(true)}
        >
          <Plus className="h-4 w-4" />
          New Project
        </Button>
        
        {hasProjects && (
          <Button 
            variant="secondary"
            className="gap-2"
            onClick={() => router.push(`/projects/${projects[0].id}`)}
          >
            <Sparkles className="h-4 w-4" />
            Continue: {projects[0].name.length > 20 ? projects[0].name.slice(0, 20) + '...' : projects[0].name}
          </Button>
        )}

        <Link href="/review">
          <Button variant="outline" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Review
            {approvedOutputs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                {approvedOutputs.length}
              </span>
            )}
          </Button>
        </Link>

        <Link href="/bookmarks">
          <Button variant="outline" className="gap-2">
            <Bookmark className="h-4 w-4" />
            Bookmarks
          </Button>
        </Link>
      </div>

      {/* Recent Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Recent Projects</h2>
            <p className="text-sm text-muted-foreground">
              {hasProjects
                ? 'Pick up where you left off'
                : 'Create your first project to get started'}
            </p>
          </div>
          {hasProjects && (
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="gap-1">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-0">
                  <div className="aspect-video bg-muted" />
                </CardContent>
                <div className="p-4 space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : hasProjects ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onProjectUpdate={handleProjectUpdate}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FolderKanban className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Create your first project to start generating AI images and videos
              </p>
              <Button onClick={() => setShowNewProject(true)} size="lg">
                <Plus className="mr-2 h-5 w-5" />
                Create Your First Project
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Creations Feed */}
      {(recentOutputs.length > 0 || recentLoading) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Recent Creations</h2>
              <p className="text-sm text-muted-foreground">
                Your latest generated images and videos
              </p>
            </div>
          </div>

          {recentLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {recentOutputs.map((output) => (
                <Link
                  key={output.id}
                  href={`/projects/${output.generation.session.project.id}`}
                  className="group relative aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary/50 transition-all"
                >
                  {output.fileType === 'video' ? (
                    <video
                      src={output.fileUrl}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause()
                        e.currentTarget.currentTime = 0
                      }}
                    />
                  ) : (
                    <Image
                      src={output.fileUrl}
                      alt={output.generation.prompt.slice(0, 100)}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
                    />
                  )}
                  
                  {/* Overlay with type indicator and time */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <div className="flex items-center justify-between text-white text-xs">
                        <span className="flex items-center gap-1">
                          {output.fileType === 'video' ? (
                            <Play className="h-3 w-3" />
                          ) : (
                            <ImageIcon className="h-3 w-3" />
                          )}
                          {output.fileType}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(output.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Video indicator badge (always visible) */}
                  {output.fileType === 'video' && (
                    <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
                      <Play className="h-3 w-3 text-white" />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Section */}
      {hasProjects && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Projects</CardDescription>
              <CardTitle className="text-3xl">{projects.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approved Items</CardDescription>
              <CardTitle className="text-3xl">{approvedOutputs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ready for Review</CardDescription>
              <CardTitle className="text-3xl text-primary">
                {approvedOutputs.length > 0 ? 'Yes' : 'No'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* New Project Dialog */}
      <NewProjectDialog
        open={showNewProject}
        onOpenChange={setShowNewProject}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  )
}
