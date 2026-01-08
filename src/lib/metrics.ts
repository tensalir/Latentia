interface MetricEvent {
  name: string
  durationMs: number
  status: 'success' | 'error'
  meta?: Record<string, any>
}

/**
 * Lightweight console-based metrics logger used across server routes and hooks.
 * Structured logs let us diff performance between refactors without extra infra.
 */
export function logMetric(event: MetricEvent) {
  const payload = {
    type: 'metric',
    ...event,
    timestamp: new Date().toISOString(),
  }

  if (typeof window !== 'undefined') {
    // Browser console - keep readable for devtools
    console.log('[metric]', payload)
  } else {
    // Serverless logs - stringify for easier ingestion
    console.log('[metric]', JSON.stringify(payload))
  }
}

