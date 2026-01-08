import { ProjectCard } from './ProjectCard'
import type { Project } from '@/types/project'

interface ProjectGridProps {
  projects: Project[]
  currentUserId?: string
  onProjectUpdate?: () => void
}

export function ProjectGrid({ projects, currentUserId, onProjectUpdate }: ProjectGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {projects.map((project) => (
        <ProjectCard 
          key={project.id} 
          project={project} 
          currentUserId={currentUserId}
          onProjectUpdate={onProjectUpdate}
        />
      ))}
    </div>
  )
}

