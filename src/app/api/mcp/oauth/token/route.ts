import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Token endpoint stub — Vesper MCP primarily uses long-lived vsp_live bearer
 * tokens issued from /headless. Clients expecting OAuth should complete setup
 * on the headless page and configure the bearer token in mcp.json.
 */
export async function POST(request: NextRequest) {
  void request
  return NextResponse.json(
    {
      error: 'unsupported_grant',
      error_description:
        'Vesper MCP uses bearer tokens (vsp_live_*) from the /headless credential UI. Visit /headless after signing in to generate your MCP URL.',
      documentation: '/headless',
    },
    { status: 400 }
  )
}
