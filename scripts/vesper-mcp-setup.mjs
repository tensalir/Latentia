#!/usr/bin/env node
/**
 * Print Vesper MCP setup snippets for Cursor / Claude Code.
 *
 * Usage:
 *   node scripts/vesper-mcp-setup.mjs
 *   node scripts/vesper-mcp-setup.mjs --base https://vesper.loop.dev --token vsp_live_...
 */

function parseArgs(argv) {
  const out = { base: 'https://vesper.loop.dev', token: 'vsp_live_<your-token>' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--base' && argv[i + 1]) out.base = argv[++i]
    if (arg === '--token' && argv[i + 1]) out.token = argv[++i]
  }
  return out
}

const { base, token } = parseArgs(process.argv.slice(2))
const url = `${base.replace(/\/$/, '')}/api/mcp/${token}`

console.log(`
Vesper MCP setup
================

Cursor / Claude Code (~/.cursor/mcp.json or project .mcp.json):

{
  "mcpServers": {
    "vesper": {
      "url": "${url.includes('<') ? `${base.replace(/\/$/, '')}/api/mcp` : url}",
      ${url.includes('<') ? `"headers": { "Authorization": "Bearer ${token}" },` : ''}
      "timeout": 120000
    }
  }
}

Slash prompts (after MCP connect): /vesper:generate /vesper:enhance /vesper:iterate

Skill bundle: src/lib/skills/vesper-mcp/SKILL.md

OAuth discovery: ${base.replace(/\/$/, '')}/.well-known/oauth-protected-resource
`)
