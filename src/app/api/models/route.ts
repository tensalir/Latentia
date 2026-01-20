import { NextRequest, NextResponse } from 'next/server'
import { getAllModels, getModelsByType } from '@/lib/models/registry'

// Route segment config: models data is static and can be cached
// Note: Can't use force-static with search params, rely on Cache-Control headers
export const revalidate = 3600 // Allow ISR-like revalidation every hour

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as 'image' | 'video' | null

    const models = type ? getModelsByType(type) : getAllModels()

    return NextResponse.json({ models }, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error: any) {
    console.error('Models API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch models' },
      { status: 500 }
    )
  }
}

