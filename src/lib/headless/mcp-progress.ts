/**
 * Best-effort progress reporting for long-running MCP tool calls.
 *
 * The MCP spec supports `notifications/progress` with `_meta.progressToken`
 * on streamable-http transports. Current Claude/Cursor clients often do
 * NOT reset their ~60s tool-call timer when progress arrives (see Claude
 * Code issues #58687, #50289). This helper accumulates human-readable
 * steps into the tool result text today, and exposes a hook for a future
 * SSE/streaming upgrade on `/api/mcp`.
 */

export interface McpProgressStep {
  message: string
  percent?: number
  at: number
}

export class McpProgressReporter {
  private steps: McpProgressStep[] = []

  step(message: string, percent?: number): void {
    this.steps.push({ message, percent, at: Date.now() })
  }

  getSteps(): McpProgressStep[] {
    return [...this.steps]
  }

  /** Append a compact progress trail to a tool summary string. */
  appendToSummary(summary: string): string {
    if (this.steps.length === 0) return summary
    const trail = this.steps.map((s) => s.message).join(' → ')
    return `${summary}\n\nProgress: ${trail}`
  }
}

/** Default inline image payload cap (~450 KB raw ≈ ~600 KB base64). */
export const MCP_INLINE_IMAGE_MAX_BYTES = 450_000
