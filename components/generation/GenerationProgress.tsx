'use client'

import { useEffect, useState } from 'react'

interface GenerationProgressProps {
  estimatedTime?: number // in seconds
  onComplete?: () => void
  aspectRatio?: string
  isVideo?: boolean
}

// Specific customer insights from Loop Earplugs research (18,176 reviews & 14,536 tickets)
// Based on Deep-dive session 5 - Untapped use cases analysis
// Keep these short, concrete, and "scene-like" — they show real use cases and frustrations.
const CUSTOMER_INSIGHTS = [
  // Sleep Aid use cases (3,368 reviews)
  'Sleep is the #1 use case—3,368 reviews mention using Loop for snoring partners and street noise.',
  'Side sleepers struggle with earplugs that create pressure points—Loop&apos;s low profile solves this.',
  'Light sleepers wake up to every noise—Loop helps them stay asleep through partner snoring and traffic.',
  'Shift workers can&apos;t sleep during the day due to daytime noise—Loop blocks it out between shifts.',
  'Urban sleepers deal with constant traffic and city noise—Loop makes their bedrooms quieter.',
  
  // Noise Sensitivity use cases (2,702 reviews)
  'Neurodivergent students get overwhelmed in loud classrooms—Loop helps them focus without feeling isolated.',
  'Busy parents need relief from household chaos—Loop takes the edge off screaming kids and appliances.',
  'HSPs (highly sensitive people) struggle in crowded spaces—Loop helps them manage sensory overload.',
  'Open office workers can&apos;t concentrate with constant chatter—Loop mutes distractions while keeping conversations audible.',
  'Social butterflies with sensory issues want to enjoy gatherings—Loop lets them participate without overwhelm.',
  
  // Concerts/Music Events (1,505 reviews)
  'Concert‑goers want to protect hearing without muffling music—Loop preserves sound quality while reducing volume.',
  'Festival attendees struggle with bass from neighboring stages—Loop helps them sleep at multi‑day events.',
  'Musicians need earplugs that preserve tonal balance—Loop outperforms foam plugs for sound clarity.',
  
  // Workplace Productivity
  'Remote workers can&apos;t focus in noisy cafés or open‑plan homes—Loop creates a quiet workspace anywhere.',
  'Teachers get overwhelmed by loud classrooms and hallways—Loop helps them stay calm without isolating themselves.',
  
  // Travel/Commuting (568 tickets)
  'Frequent business travelers struggle with airplane cabin noise—Loop makes long flights more comfortable.',
  'Family travelers need to manage noise for both adults and kids—Loop helps everyone sleep better on trips.',
  'Commuters get overwhelmed by rush hour chaos—Loop makes trains and buses feel less stressful.',
  
  // Parenting/Household
  'Parents need to hear their kids but reduce overwhelming noise—Loop takes the edge off without blocking everything.',
  
  // Motorcycle Riding (623 tickets)
  'Motorcyclists get fatigued from constant wind noise—Loop reduces wind roar while keeping essential sounds audible.',
  'Riders need earplugs that fit comfortably under helmets—Loop&apos;s low profile works for long rides.',
  
  // Tinnitus/Hearing Protection
  'Tinnitus sufferers need to protect their ears from further damage—Loop helps prevent flare‑ups after loud events.',
  
  // Sports and Exercise (454 tickets)
  'Gym enthusiasts find class music too loud—Loop reduces volume while keeping safety cues and instructor voices clear.',
  'Outdoor cyclists struggle with wind noise—Loop reduces fatigue on long rides while maintaining traffic awareness.',
  'Team sports coaches need to communicate clearly in loud environments—Loop helps them hear players without overwhelm.',
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
