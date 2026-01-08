import { NextRequest, NextResponse } from 'next/server'
import { getModel } from '@/lib/models/registry'

// GET /api/models/[id] - Get specific model configuration
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const modelId = params.id
    const model = getModel(modelId)

    if (!model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      )
    }

    const config = model.getConfig()

    return NextResponse.json(config)
  } catch (error) {
    console.error('Error fetching model config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch model configuration' },
      { status: 500 }
    )
  }
}

