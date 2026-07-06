import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Dynamic client registration stub for MCP OAuth discovery. */
export async function POST(request: NextRequest) {
  void request
  return NextResponse.json(
    {
      client_id: 'vesper-mcp-public',
      client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201 }
  )
}
