'use client'

import { useState, useEffect } from 'react'
import { DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatCost } from '@/lib/cost/calculator'

interface SpendingData {
  totalCost: number
  totalGenerations: number
  providerBreakdown: Array<{
    provider: string
    totalCost: number
    generationCount: number
    models: Array<{
      modelName: string
      cost: number
      generationCount: number
    }>
  }>
}

interface SpendingTrackerProps {
  isAdmin: boolean
}

export function SpendingTracker({ isAdmin }: SpendingTrackerProps) {
  const [spendingData, setSpendingData] = useState<SpendingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }

    fetchSpending()
    // Refresh every 30 seconds
    const interval = setInterval(fetchSpending, 30000)
    return () => clearInterval(interval)
  }, [isAdmin])

  const fetchSpending = async () => {
    try {
      const response = await fetch('/api/analytics/spending')
      if (response.ok) {
        const data = await response.json()
        setSpendingData(data)
      }
    } catch (error) {
      console.error('Failed to fetch spending:', error)
    } finally {
      setLoading(false)
    }
  }

  // Don't render if not admin
  if (!isAdmin) {
    return null
  }

  const totalCost = spendingData?.totalCost || 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Spending Overview">
          <DollarSign className="h-4 w-4" />
          {!loading && totalCost > 0 && (
            <span className="absolute -top-1 -right-1 text-[10px] font-semibold text-primary">
              {totalCost < 1 ? totalCost.toFixed(3) : totalCost.toFixed(1)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" className="w-80 p-0" align="end">
          <div className="p-4">
            <div className="mb-3 border-b border-border pb-2">
              <h3 className="font-semibold text-sm">Spending Overview</h3>
              <p className="text-xs text-muted-foreground">
                Total: {formatCost(totalCost)} ({spendingData?.totalGenerations || 0} generations)
              </p>
            </div>
            {spendingData?.providerBreakdown && spendingData.providerBreakdown.length > 0 ? (
              <div className="space-y-3">
                {spendingData.providerBreakdown.map((provider) => (
                  <div key={provider.provider} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{provider.provider}</span>
                      <span className="text-sm font-semibold">{formatCost(provider.totalCost)}</span>
                    </div>
                    <div className="pl-2 space-y-0.5">
                      {provider.models.map((model) => (
                        <div key={model.modelName} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{model.modelName}</span>
                          <span>{formatCost(model.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No spending data yet</p>
            )}
          </div>
      </PopoverContent>
    </Popover>
  )
}

