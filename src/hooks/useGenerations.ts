import { useQuery } from '@tanstack/react-query'
import type { GenerationWithOutputs } from '@/types/generation'
import { logMetric } from '@/lib/metrics'

async function fetchGenerations(sessionId: string, limit: number = 20): Promise<GenerationWithOutputs[]> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  try {
    const response = await fetch(`/api/generations?sessionId=${sessionId}&limit=${limit}`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch generations')
    }
    
    const payload = await response.json()
    logMetric({
      name: 'hook_fetch_generations',
      status: 'success',
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
      meta: { sessionId, limit, resultCount: payload?.length || 0 },
    })
    return payload
  } catch (error: any) {
    logMetric({
      name: 'hook_fetch_generations',
      status: 'error',
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
      meta: { sessionId, limit, error: error?.message },
    })
    throw error
  }
}

/**
 * Trigger background process for a generation that hasn't started yet
 * This is a fallback for when server-side trigger fails
 */
async function triggerProcessForStuckGeneration(generationId: string) {
  console.log(`🔄 Attempting to trigger process for generation: ${generationId}`)
  try {
    const res = await fetch('/api/generate/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    })
    if (res.ok) {
      console.log(`✅ Successfully triggered process for ${generationId}`)
    } else {
      const errorText = await res.text()
      console.warn(`⚠️ Failed to trigger process for ${generationId}: ${res.status} ${errorText}`)
    }
  } catch (err) {
    console.error(`❌ Error triggering process for ${generationId}:`, err)
  }
}

/**
 * Check for stuck generations and trigger cleanup if needed
 * A generation is considered stuck if it's been processing for > 2 minutes
 * (Vercel Pro timeout is 60s, so 2min is definitely stuck)
 * Also checks for generations that haven't started processing (> 10 seconds with no heartbeat)
 */
async function checkAndCleanupStuckGenerations(generations: GenerationWithOutputs[]) {
  const now = Date.now()
  const TWO_MINUTES = 2 * 60 * 1000
  const TEN_SECONDS = 10 * 1000
  
  // Check for generations that haven't started processing (no heartbeat after 10s)
  const notStartedGenerations = generations.filter(gen => {
    if (gen.status !== 'processing') return false
    const createdAt = new Date(gen.createdAt).getTime()
    const age = now - createdAt
    // Check if it's been > 10 seconds and no heartbeat/process step
    const params = gen.parameters as any
    const lastStep = params?.lastStep
    const hasStarted = lastStep && lastStep !== 'generate:create'
    return age > TEN_SECONDS && !hasStarted
  })
  
  // Trigger process for generations that haven't started
  for (const gen of notStartedGenerations) {
    console.log(`🔄 Generation ${gen.id} hasn't started processing after 10s, triggering process endpoint...`)
    triggerProcessForStuckGeneration(gen.id)
  }
  
  // Check for truly stuck generations (> 2 minutes)
  const stuckGenerations = generations.filter(gen => {
    if (gen.status !== 'processing') return false
    const createdAt = new Date(gen.createdAt).getTime()
    const age = now - createdAt
    return age > TWO_MINUTES
  })
  
  if (stuckGenerations.length > 0) {
    console.warn(`⚠️ Found ${stuckGenerations.length} stuck generation(s) (older than 2 minutes), triggering cleanup...`, 
      stuckGenerations.map(g => ({ id: g.id, age: Math.round((now - new Date(g.createdAt).getTime()) / 1000) + 's' }))
    )
    // Trigger cleanup endpoint (best effort, don't await)
    fetch('/api/admin/cleanup-stuck-generations', {
      method: 'POST',
    })
    .then(async (res) => {
      const data = await res.json()
      console.log('✅ Cleanup response:', data)
    })
    .catch(err => {
      console.error('❌ Failed to trigger cleanup:', err)
    })
  }
}

export function useGenerations(sessionId: string | null, limit: number = 20) {
  return useQuery({
    queryKey: ['generations', sessionId],
    queryFn: async () => {
      const data = await fetchGenerations(sessionId!, limit)
      // Check for stuck generations after fetching
      checkAndCleanupStuckGenerations(data)
      return data
    },
    enabled: !!sessionId, // Only run if sessionId exists
    staleTime: 10 * 1000, // 10 seconds - generations update frequently during processing
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes for faster navigation
    refetchOnMount: false, // Use cached data if fresh - real-time updates handle new data
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchInterval: (query) => {
      // Poll more frequently if there are processing generations
      const data = query.state.data as GenerationWithOutputs[] | undefined
      if (!data) return false
      
      // Check if any generations are processing
      const processingGenerations = data.filter(gen => gen.status === 'processing')
      const hasProcessingGenerations = processingGenerations.length > 0
      
      if (hasProcessingGenerations) {
        // Check for stuck generations periodically (every 10th poll ~20 seconds)
        if (Math.random() < 0.1) {
          checkAndCleanupStuckGenerations(data)
        }
        
        // Log occasionally for debugging (every 10th poll)
        if (Math.random() < 0.1) {
          console.log(`📊 Polling: ${processingGenerations.length} generation(s) in progress`)
        }
        
        // Poll every 2 seconds for faster updates
        return 2000
      }
      
      return false
    },
  })
}

