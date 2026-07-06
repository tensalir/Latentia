/**
 * MCP `prompts/list` + `prompts/get` definitions for Vesper.
 * Maps to slash-command style names: /vesper:generate, etc.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface McpPromptDefinition {
  name: string
  title: string
  description: string
  arguments?: Array<{
    name: string
    description: string
    required?: boolean
  }>
}

export const MCP_PROMPTS: McpPromptDefinition[] = [
  {
    name: 'vesper:generate',
    title: 'Generate a Loop image with Vesper',
    description:
      'Enhance the prompt with the Gen-AI prompting skill, pick an allowed Vesper image model, and call generate_asset. Use list_product_renders when the brief needs real Loop product imagery.',
    arguments: [
      {
        name: 'prompt',
        description: 'What to generate — subject, scene, lighting, aspect ratio intent.',
        required: true,
      },
      {
        name: 'modelId',
        description:
          'Optional Vesper model id (default gemini-nano-banana-pro). Call list_models first.',
      },
    ],
  },
  {
    name: 'vesper:enhance',
    title: 'Enhance a prompt with Vesper',
    description:
      'Run enhance_prompt using the Loop Gen-AI prompting skill before sending the prompt to any image model.',
    arguments: [
      {
        name: 'prompt',
        description: 'Raw prompt to sharpen.',
        required: true,
      },
      {
        name: 'modelId',
        description: 'Target model id so the skill picks the right enhancement strategy.',
        required: true,
      },
    ],
  },
  {
    name: 'vesper:iterate',
    title: 'Build an Andromeda-aware variant slate',
    description:
      'Run iterate_prompt to produce a structured slate of ad variants with locked anchors and diversified axes.',
    arguments: [
      {
        name: 'prompt',
        description: 'Baseline concept or prompt.',
        required: true,
      },
      {
        name: 'modelId',
        description: 'Target Vesper model id.',
        required: true,
      },
    ],
  },
]

function loadGenAiSkillExcerpt(): string {
  try {
    const skillPath = join(
      process.cwd(),
      'src/lib/skills/genai-prompting/SKILL.md'
    )
    const raw = readFileSync(skillPath, 'utf8')
    return raw.length > 12_000 ? `${raw.slice(0, 12_000)}\n\n…(truncated)` : raw
  } catch {
    return 'Gen-AI prompting skill unavailable on this deployment.'
  }
}

export function getMcpPromptMessages(
  name: string,
  args: Record<string, string | undefined>
): { description: string; messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> } | null {
  const prompt = args.prompt?.trim()
  const modelId = args.modelId?.trim() || 'gemini-nano-banana-pro'

  switch (name) {
    case 'vesper:generate':
      return {
        description: 'Generate a Vesper image end-to-end',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'You are connected to the Vesper MCP server.',
                '1. Call list_models if you need to confirm allowed models.',
                '2. Optionally call enhance_prompt to sharpen the brief.',
                '3. Call generate_asset with the enhanced prompt.',
                '4. Show the returned image inline and keep the Storage URL for iteration.',
                '',
                `Prompt: ${prompt || '(describe what the user asked for)'}`,
                `Suggested modelId: ${modelId}`,
                '',
                'If generation may exceed 60s, pass async: true and poll get_generation_status.',
              ].join('\n'),
            },
          },
        ],
      }
    case 'vesper:enhance':
      return {
        description: 'Enhance a prompt via Vesper',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Call the Vesper enhance_prompt tool with:',
                `prompt: ${prompt || '(user brief)'}`,
                `modelId: ${modelId}`,
                '',
                'Return the enhanced prompt only — do not generate yet unless asked.',
              ].join('\n'),
            },
          },
        ],
      }
    case 'vesper:iterate':
      return {
        description: 'Build a Vesper iteration slate',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Call the Vesper iterate_prompt tool with:',
                `prompt: ${prompt || '(user brief)'}`,
                `modelId: ${modelId}`,
                '',
                'Return the JSON slate and offer to generate the strongest variants.',
              ].join('\n'),
            },
          },
        ],
      }
    default:
      return null
  }
}

export function findMcpPrompt(name: string): McpPromptDefinition | undefined {
  return MCP_PROMPTS.find((p) => p.name === name)
}

export function getGenAiSkillResourceText(): string {
  return loadGenAiSkillExcerpt()
}
