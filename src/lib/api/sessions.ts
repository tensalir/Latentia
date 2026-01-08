import type { Session } from '@/types/project'

export async function getSessions(projectId: string): Promise<Session[]> {
  const response = await fetch(`/api/sessions?projectId=${projectId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch sessions')
  }
  return response.json()
}

export async function createSession(data: {
  projectId: string
  name: string
  type: 'image' | 'video'
}): Promise<Session> {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error('Failed to create session')
  }

  return response.json()
}

