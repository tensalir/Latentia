/**
 * Async MCP generation jobs — polled via get_generation_status.
 *
 * Jobs are stored in `headless_mcp_jobs` so slow video generations and
 * async image runs survive client tool-call timeouts (~60s on Claude/Cursor).
 */

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { generateAssetTool, type GenerateAssetResult } from './generate-asset'
import { generateVideoTool, type GenerateVideoResult } from './generate-video'
import type { McpProgressReporter } from './mcp-progress'

export type HeadlessMcpJobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface HeadlessMcpJobRecord {
  id: string
  credentialId: string
  ownerId: string
  toolName: string
  modelId: string
  status: HeadlessMcpJobStatus
  request: Record<string, unknown>
  result: GenerateAssetResult | GenerateVideoResult | null
  error: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

function mapJob(row: {
  id: string
  credentialId: string
  ownerId: string
  toolName: string
  modelId: string
  status: string
  request: unknown
  result: unknown
  error: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}): HeadlessMcpJobRecord {
  return {
    id: row.id,
    credentialId: row.credentialId,
    ownerId: row.ownerId,
    toolName: row.toolName,
    modelId: row.modelId,
    status: row.status as HeadlessMcpJobStatus,
    request: (row.request as Record<string, unknown>) ?? {},
    result: (row.result as GenerateAssetResult | GenerateVideoResult | null) ?? null,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  }
}

export async function createHeadlessMcpJob(input: {
  credentialId: string
  ownerId: string
  toolName: string
  modelId: string
  request: Record<string, unknown>
}): Promise<HeadlessMcpJobRecord> {
  const row = await prisma.headlessMcpJob.create({
    data: {
      id: randomUUID(),
      credentialId: input.credentialId,
      ownerId: input.ownerId,
      toolName: input.toolName,
      modelId: input.modelId,
      status: 'queued',
      request: input.request as never,
    },
  })
  return mapJob(row)
}

export async function getHeadlessMcpJob(
  jobId: string,
  credentialId: string
): Promise<HeadlessMcpJobRecord | null> {
  const row = await prisma.headlessMcpJob.findFirst({
    where: { id: jobId, credentialId },
  })
  return row ? mapJob(row) : null
}

async function markJobProcessing(jobId: string): Promise<boolean> {
  const updated = await prisma.headlessMcpJob.updateMany({
    where: { id: jobId, status: 'queued' },
    data: { status: 'processing' },
  })
  return updated.count > 0
}

async function completeJob(
  jobId: string,
  result: GenerateAssetResult | GenerateVideoResult
): Promise<void> {
  await prisma.headlessMcpJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      result: result as never,
      error: null,
      completedAt: new Date(),
    },
  })
}

async function failJob(jobId: string, message: string): Promise<void> {
  await prisma.headlessMcpJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      error: message,
      completedAt: new Date(),
    },
  })
}

/** Run a queued job once (single-flight via status transition). */
export async function processHeadlessMcpJobIfQueued(
  job: HeadlessMcpJobRecord,
  principal: { allowedModels: string[]; credentialId: string; ownerId: string },
  progress?: McpProgressReporter
): Promise<HeadlessMcpJobRecord> {
  if (job.status === 'completed' || job.status === 'failed') return job
  if (job.status === 'processing') return job

  const claimed = await markJobProcessing(job.id)
  if (!claimed) {
    const latest = await getHeadlessMcpJob(job.id, principal.credentialId)
    return latest ?? job
  }

  progress?.step('Job started')

  try {
    if (job.toolName === 'generate_asset') {
      const result = await generateAssetTool(job.request, {
        allowedModels: principal.allowedModels,
        credentialId: principal.credentialId,
        ownerId: principal.ownerId,
        progress,
      })
      await completeJob(job.id, result)
    } else if (job.toolName === 'generate_video') {
      const result = await generateVideoTool(job.request, {
        allowedModels: principal.allowedModels,
        credentialId: principal.credentialId,
        ownerId: principal.ownerId,
        progress,
      })
      await completeJob(job.id, result)
    } else {
      throw new Error(`Unsupported async tool: ${job.toolName}`)
    }
  } catch (err) {
    const message = (err as Error)?.message || 'Job failed'
    await failJob(job.id, message)
  }

  const latest = await getHeadlessMcpJob(job.id, principal.credentialId)
  return latest ?? job
}

export function jobToMcpResult(job: HeadlessMcpJobRecord): {
  content: import('./generate-asset').McpContent[]
  structuredContent: Record<string, unknown>
  isError?: boolean
} {
  if (job.status === 'queued' || job.status === 'processing') {
    return {
      content: [
        {
          type: 'text',
          text: `Job ${job.id} is ${job.status}. Poll get_generation_status again in a few seconds.`,
        },
      ],
      structuredContent: {
        jobId: job.id,
        status: job.status,
        toolName: job.toolName,
        modelId: job.modelId,
      },
    }
  }

  if (job.status === 'completed' && job.result) {
    return {
      content: job.result.content,
      structuredContent: {
        jobId: job.id,
        status: job.status,
        ...(job.result.structuredContent as Record<string, unknown>),
      },
    }
  }

  if (job.status === 'failed') {
    return {
      isError: true,
      content: [{ type: 'text', text: job.error || 'Job failed' }],
      structuredContent: {
        jobId: job.id,
        status: job.status,
        error: job.error,
      },
    }
  }

  const result = job.result
  if (!result) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Job completed but result payload is missing.' }],
      structuredContent: { jobId: job.id, status: job.status },
    }
  }

  return {
    content: result.content.filter((c) => c.type === 'text'),
    structuredContent: {
      jobId: job.id,
      status: job.status,
      ...(result.structuredContent as Record<string, unknown>),
    },
  }
}
