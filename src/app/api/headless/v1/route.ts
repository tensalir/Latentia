import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/headless/v1 — public discovery (no auth).
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      service: 'vesper-headless',
      version: 'v1',
      authentication: {
        scheme: 'Bearer',
        description:
          'Issue a credential via /headless or admin UI. Send `Authorization: Bearer vsp_live_...` on every request.',
        oauthProtectedResource: '/.well-known/oauth-protected-resource',
      },
      surfaces: {
        rest: '/api/headless/v1',
        mcp: '/api/mcp',
      },
      tools: [
        {
          name: 'enhance_prompt',
          rest: 'POST /api/headless/v1/prompts/enhance',
        },
        {
          name: 'iterate_prompt',
          rest: 'POST /api/headless/v1/prompts/iterate',
        },
        {
          name: 'list_models',
          rest: 'GET /api/headless/v1/models',
        },
        {
          name: 'generate_asset',
          mcpOnly: true,
        },
        {
          name: 'generate_video',
          mcpOnly: true,
        },
        {
          name: 'get_generation_status',
          mcpOnly: true,
        },
        {
          name: 'estimate_generation_cost',
          mcpOnly: true,
        },
        {
          name: 'list_product_renders',
          mcpOnly: true,
        },
      ],
      mcpPrompts: ['vesper:generate', 'vesper:enhance', 'vesper:iterate'],
      mcpResources: [
        'vesper://product-renders',
        'vesper://models',
        'vesper://skill/genai-prompting',
      ],
      docs: '/docs/headless-vesper.md',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    }
  )
}
