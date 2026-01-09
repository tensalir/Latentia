import { useEffect, useMemo, useRef, useCallback } from 'react'
import { useQueryClient, InfiniteData } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { GenerationWithOutputs } from '@/types/generation'

interface PaginatedGenerationsResponse {
  data: GenerationWithOutputs[]
  nextCursor?: string
  hasMore: boolean
}

/**
 * Hook to subscribe to real-time generation updates via Supabase Realtime
 * 
 * Optimizations:
 * - Only subscribes to generations table (filtered by session_id)
 * - Removed unfiltered outputs subscription (was causing unnecessary refetches)
 * - Uses targeted cache updates when possible, debounced invalidation as fallback
 * - 3-second debounce to prevent race conditions with optimistic updates
 */
export function useGenerationsRealtime(sessionId: string | null, userId: string | null) {
  const queryClient = useQueryClient()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastEventRef = useRef<string | null>(null)
  const isTempSession = !!sessionId && sessionId.startsWith('temp-')

  // Debounce invalidation by 3 seconds to prevent race condition with optimistic updates
  // This gives the mutation's onSuccess time to update the cache first
  const debouncedInvalidate = useCallback(() => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      // Set new timeout
      timeoutRef.current = setTimeout(() => {
      // Only invalidate if the session is still active
      if (sessionId) {
        queryClient.invalidateQueries({ 
          queryKey: ['generations', sessionId],
          refetchType: 'active'
        })
        queryClient.invalidateQueries({ 
          queryKey: ['generations', 'infinite', sessionId],
          refetchType: 'active'
        })
      }
        timeoutRef.current = null
    }, 3000)
  }, [sessionId, queryClient])

  // Try to update cache directly for status changes (more efficient than refetch)
  const tryDirectCacheUpdate = useCallback((generationId: string, newStatus: string) => {
    if (!sessionId) return false
    
    let updated = false
    
    // Update infinite query cache
    queryClient.setQueryData<InfiniteData<PaginatedGenerationsResponse>>(
      ['generations', 'infinite', sessionId],
      (old) => {
        if (!old) return old
        
        return {
          ...old,
          pages: old.pages.map((page) => {
            const foundIndex = page.data.findIndex(gen => gen.id === generationId)
            if (foundIndex !== -1 && page.data[foundIndex].status !== newStatus) {
              updated = true
              const newData = [...page.data]
              newData[foundIndex] = {
                ...newData[foundIndex],
                status: newStatus as any,
              }
              return { ...page, data: newData }
            }
            return page
          }),
        }
      }
    )
    
    return updated
  }, [sessionId, queryClient])

  useEffect(() => {
    // Avoid realtime subscriptions for optimistic "temp-*" session IDs
    if (!sessionId || !userId || isTempSession) return

    const supabase = createClient()

    console.log(`🔴 Subscribing to real-time updates for session: ${sessionId}`)

    // Subscribe to generation changes for this session ONLY
    // This is the only subscription we need - status changes from processing → completed
    // will trigger a refetch that includes the new outputs
    const generationsChannel = supabase
      .channel(`generations:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'generations',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const newData = payload.new as any
          const eventKey = `${payload.eventType}-${newData?.id}-${newData?.status}`
          
          // Deduplicate events (Supabase can send duplicates)
          if (lastEventRef.current === eventKey) {
            return
          }
          lastEventRef.current = eventKey
          
          console.log('🔴 Generation change detected:', payload.eventType, newData?.id, newData?.status)

          // For status updates, try direct cache update first (faster)
          if (payload.eventType === 'UPDATE' && newData?.id && newData?.status) {
            const directUpdated = tryDirectCacheUpdate(newData.id, newData.status)
            
            // If we couldn't update directly (e.g., generation not in cache), 
            // or status changed to 'completed' (need to fetch outputs), invalidate
            if (!directUpdated || newData.status === 'completed') {
              debouncedInvalidate()
            }
          } else {
            // For INSERT/DELETE, always invalidate
          debouncedInvalidate()
          }
        }
      )
      .subscribe((status) => {
        console.log('🔴 Realtime subscription status:', status)
      })

    // NOTE: Removed outputs subscription - it was unfiltered and caused unnecessary refetches
    // The generation status change to 'completed' is sufficient to trigger a refetch
    // that will include the new outputs

    // Cleanup subscription on unmount
    return () => {
      console.log(`🔴 Unsubscribing from real-time updates for session: ${sessionId}`)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      lastEventRef.current = null
      supabase.removeChannel(generationsChannel)
    }
  }, [sessionId, userId, debouncedInvalidate, tryDirectCacheUpdate])
}

