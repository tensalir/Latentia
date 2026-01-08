export interface ProjectOwner {
  id: string
  displayName: string | null
  username: string | null
}

export interface Project {
  id: string
  name: string
  description?: string
  coverImageUrl?: string
  ownerId: string
  isShared: boolean
  createdAt: Date
  updatedAt: Date
  owner?: ProjectOwner
  thumbnailUrl?: string | null
  sessionCount?: number
}

export interface ProjectWithSessions extends Project {
  sessions: Session[]
  members?: ProjectMember[]
}

export interface ProjectMember {
  id: string
  projectId: string
  userId: string
  role: 'viewer' | 'editor' | 'admin'
  joinedAt: Date
}

export interface SessionCreator {
  id: string
  displayName: string | null
  username: string | null
}

export interface Session {
  id: string
  projectId: string
  name: string
  type: 'image' | 'video'
  isPrivate: boolean
  createdAt: Date
  updatedAt: Date
  creator?: SessionCreator | null
}

