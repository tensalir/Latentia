'use client'

import { useEffect, useState } from 'react'

interface GenerationProgressProps {
  estimatedTime?: number // in seconds
  onComplete?: () => void
  aspectRatio?: string
  isVideo?: boolean
}

// Specific customer insights from Loop Earplugs research (18,176 reviews & 14,536 tickets)
// Keep these short, concrete, and “scene-like” — they show real use cases, not generic claims.
const CUSTOMER_INSIGHTS = [
  'Sleep is the #1 use case—snoring and street noise show up constantly in reviews.',
  'Side sleepers rave about low‑profile comfort: “no pressure points” is a repeat theme.',
  'Neurodivergent users use Loop to dial down sensory overload in shops, offices, and transit.',
  'Concert‑goers protect hearing without “muffling the music” or killing conversation.',
  'Shift workers rely on Loop to sleep through daytime noise between long shifts.',
  'Motorcyclists tame wind roar on highway rides—less fatigue, more comfort.',
  'Parents use Loop to take the edge off screaming without tuning out their kids.',
  'Remote workers use Loop to focus in open‑plan homes and noisy cafés.',
  'Frequent flyers soften cabin noise and make announcements feel less jarring.',
  'Teachers stay calmer in loud classrooms and hallways without feeling isolated.',
  'Tinnitus‑prone users reach for Loop after loud nights to avoid flare‑ups.',
  'Festival campers finally sleep through bass from neighboring stages.',
  'Gym‑goers reduce “too loud” class music while still hearing safety cues.',
  'Commuters make trains and buses feel less chaotic—especially at rush hour.',
  'Musicians prefer Loop over foam because it preserves tonal balance.',
]

export function GenerationProgress({
  estimatedTime = 30,
  onComplete,
  aspectRatio = '1:1',
  isVideo = false,
}: GenerationProgressProps) {
  const [startTime] = useState(() => Date.now())
  const [displayProgress, setDisplayProgress] = useState(0)
  const [currentInsightIndex, setCurrentInsightIndex] = useState(() => 
    Math.floor(Math.random() * CUSTOMER_INSIGHTS.length)
  )
  const [insightFading, setInsightFading] = useState(false)

  // Update progress on interval
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTime) / 1000
      const progressRatio = Math.min(elapsedSeconds / estimatedTime, 0.95)
      setDisplayProgress(Math.round(progressRatio * 100))
    }, 500)

    return () => clearInterval(interval)
  }, [startTime, estimatedTime])

  // Rotate insights every 5 seconds with fade effect
  useEffect(() => {
    const interval = setInterval(() => {
      setInsightFading(true)
      setTimeout(() => {
        setCurrentInsightIndex(prev => (prev + 1) % CUSTOMER_INSIGHTS.length)
        setInsightFading(false)
      }, 300)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const getAspectRatioStyle = (ratio: string) => {
    return ratio.replace(':', ' / ')
  }

  const currentInsight = CUSTOMER_INSIGHTS[currentInsightIndex]
  
  // Calculate the perimeter percentage for the border animation
  const borderProgress = displayProgress / 100

  return (
    <div
      className="relative rounded-xl"
      style={{ aspectRatio: getAspectRatioStyle(aspectRatio) }}
    >
      {/* Background */}
      <div className="absolute inset-0 rounded-xl bg-background/50 border border-border/30" />
      
      {/* Animated border - only the stroke, not fill */}
      <svg 
        className="absolute inset-0 w-full h-full rounded-xl"
        style={{ overflow: 'visible' }}
      >
        {/* Background border track */}
        <rect
          x="1.5"
          y="1.5"
          width="calc(100% - 3px)"
          height="calc(100% - 3px)"
          rx="11"
          ry="11"
          fill="none"
          stroke="hsl(var(--border) / 0.2)"
          strokeWidth="2"
          className="w-[calc(100%-3px)] h-[calc(100%-3px)]"
        />
        {/* Animated progress border */}
        <rect
          x="1.5"
          y="1.5"
          width="calc(100% - 3px)"
          height="calc(100% - 3px)"
          rx="11"
          ry="11"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          className="w-[calc(100%-3px)] h-[calc(100%-3px)]"
          style={{
            strokeDasharray: '1000',
            strokeDashoffset: `${1000 - (borderProgress * 1000)}`,
            transition: 'stroke-dashoffset 0.5s ease-out',
            filter: 'drop-shadow(0 0 4px hsl(var(--primary) / 0.5))',
          }}
        />
      </svg>

      {/* Main content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6">
        {/* Title (percentage is intentionally hidden because it's not truly accurate) */}
        <div className="relative mb-3">
          <span className="text-lg sm:text-xl font-semibold text-primary tracking-tight">
            Did you know?
          </span>
        </div>

        {/* Customer insight - more specific, more room */}
        <div className="max-w-[320px] text-center px-2">
          <p 
            className={`text-xs sm:text-sm text-muted-foreground leading-relaxed transition-all duration-300 ${
              insightFading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
            }`}
          >
            {currentInsight}
          </p>
        </div>
      </div>
    </div>
  )
}
