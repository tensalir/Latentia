import { useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { GenerationWithOutputs } from '@/types/generation'

/**
 * Hook to subscribe to real-time generation updates via Supabase Realtime
 * This replaces polling for a more efficient real-time experience
 */
export function useGenerationsRealtime(sessionId: string | null, userId: string | null) {
  const queryClient = useQueryClient()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounce invalidation by 2 seconds to prevent race condition
  // This prevents real-time updates from immediately invalidating queries
  // before optimistic updates can be processed
  const debouncedInvalidate = useMemo(() => {
    return () => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ['generations', sessionId],
          refetchType: 'active'
        })
        queryClient.invalidateQueries({ 
          queryKey: ['generations', 'infinite', sessionId],
          refetchType: 'active'
        })
        timeoutRef.current = null
      }, 2000)
    }
  }, [sessionId, queryClient])

  useEffect(() => {
    if (!sessionId || !userId) return

    const supabase = createClient()

    console.log(`🔴 Subscribing to real-time updates for session: ${sessionId}`)

    // Subscribe to generation changes for this session
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
          console.log('🔴 Generation change detected:', payload.eventType, newData?.id)

          // Debounce invalidation to prevent race condition with optimistic updates
          debouncedInvalidate()
        }
      )
      .subscribe((status) => {
        console.log('🔴 Realtime subscription status:', status)
      })

    // Subscribe to output changes (for when outputs are added to a generation)
    const outputsChannel = supabase
      .channel(`outputs:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'outputs',
        },
        async (payload) => {
          console.log('🔴 Output added:', payload.new?.id)

          // Debounce invalidation to prevent race condition
          debouncedInvalidate()
        }
      )
      .subscribe()

    // Cleanup subscriptions on unmount
    return () => {
      console.log(`🔴 Unsubscribing from real-time updates for session: ${sessionId}`)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      supabase.removeChannel(generationsChannel)
      supabase.removeChannel(outputsChannel)
    }
  }, [sessionId, userId, debouncedInvalidate])
}

