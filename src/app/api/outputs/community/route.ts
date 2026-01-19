import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

// GET /api/outputs/community - Get diverse creations from all users (Loopers' Gallery)
// 
// Diversity rules:
// 1. Strict prompt similarity filtering (Jaccard < 0.5)
// 2. Max 2 images per user in any batch
// 3. Max 2 images per session in any batch
// 4. Spread across different users/projects
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '8'), 24)
    const cursor = searchParams.get('cursor') // ISO date string for pagination

    const stopwords = new Set([
      'a','an','and','are','as','at','be','by','for','from','in','into','is','it','its',
      'of','on','or','that','the','their','then','this','to','with','without','your',
      'image','photo','photograph','picture','shot','scene','showing','shows','style',
      'high','quality','detailed','realistic','beautiful','professional',
    ])

    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const toTokenSet = (text: string) => {
      const tokens = normalize(text)
        .split(' ')
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !stopwords.has(t))
      return new Set(tokens)
    }

    const jaccard = (a: Set<string>, b: Set<string>) => {
      if (a.size === 0 && b.size === 0) return 1
      if (a.size === 0 || b.size === 0) return 0
      let intersection = 0
      const [small, large] = a.size <= b.size ? [a, b] : [b, a]
      Array.from(small).forEach((token) => {
        if (large.has(token)) intersection += 1
      })
      const union = a.size + b.size - intersection
      return union === 0 ? 0 : intersection / union
    }

    // Fetch a large pool of candidates for diversity filtering
    // Fetch more to ensure we have enough after filtering
    const poolSize = Math.min(Math.max(limit * 15, 100), 300)

    // Build cursor filter for pagination
    const cursorFilter = cursor
      ? { createdAt: { lt: new Date(cursor) } }
      : {}

    const recentGenerations = await prisma.generation.findMany({
      where: {
        status: 'completed',
        session: {
          project: {
            isShared: true,
          },
        },
        ...cursorFilter,
      },
      select: {
        id: true,
        prompt: true,
        modelId: true,
        parameters: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
        session: {
          select: {
            id: true,
            name: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        outputs: {
          select: {
            id: true,
            fileUrl: true,
            fileType: true,
            width: true,
            height: true,
            duration: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: poolSize,
    })

    const creations: any[] = []
    const seenPromptNorms = new Set<string>()
    const seenFileUrls = new Set<string>()
    const selectedTokenSets: Set<string>[] = []
    
    // Diversity tracking: limit images per user and per session
    const userCounts = new Map<string, number>()
    const sessionCounts = new Map<string, number>()
    const MAX_PER_USER = 2
    const MAX_PER_SESSION = 2
    
    // Stricter similarity threshold (lower = more strict)
    const similarityThreshold = 0.5

    let lastCreatedAt: Date | null = null

    for (const g of recentGenerations) {
      if (creations.length >= limit) break

      const output = g.outputs[0]
      if (!output) continue

      // Skip duplicate file URLs
      if (seenFileUrls.has(output.fileUrl)) continue

      // Diversity check: limit per user
      const userCount = userCounts.get(g.userId) || 0
      if (userCount >= MAX_PER_USER) continue

      // Diversity check: limit per session
      const sessionCount = sessionCounts.get(g.session.id) || 0
      if (sessionCount >= MAX_PER_SESSION) continue

      // Skip duplicate exact prompts
      const promptNorm = normalize(g.prompt)
      if (promptNorm.length === 0) continue
      if (seenPromptNorms.has(promptNorm)) continue

      // Similarity check against all selected prompts
      const tokenSet = toTokenSet(g.prompt)
      let tooSimilar = false
      for (const existing of selectedTokenSets) {
        if (jaccard(tokenSet, existing) >= similarityThreshold) {
          tooSimilar = true
          break
        }
      }
      if (tooSimilar) continue

      // Passed all filters - add to results
      seenFileUrls.add(output.fileUrl)
      seenPromptNorms.add(promptNorm)
      selectedTokenSets.push(tokenSet)
      userCounts.set(g.userId, userCount + 1)
      sessionCounts.set(g.session.id, sessionCount + 1)
      lastCreatedAt = g.createdAt

      creations.push({
        id: output.id,
        fileUrl: output.fileUrl,
        fileType: output.fileType,
        width: output.width,
        height: output.height,
        duration: output.duration,
        createdAt: output.createdAt,
        generation: {
          id: g.id,
          prompt: g.prompt,
          modelId: g.modelId,
          parameters: g.parameters as any,
          createdAt: g.createdAt,
          user: g.user,
          session: g.session,
        },
      })
    }

    // Build next cursor for pagination
    const nextCursor = creations.length >= limit && lastCreatedAt
      ? lastCreatedAt.toISOString()
      : null

    return NextResponse.json({
      data: creations,
      nextCursor,
      hasMore: nextCursor !== null,
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Error fetching community outputs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch community outputs' },
      { status: 500 }
    )
  }
}
