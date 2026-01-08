import fs from 'fs'
import path from 'path'

/**
 * Load a Claude Skill file and extract its content
 * Skills have frontmatter metadata followed by markdown content
 * 
 * @param skillName - Name of the skill file (without extension)
 * @returns Object with metadata and content, or null if not found
 */
export function loadSkill(skillName: string): { metadata: Record<string, string>; content: string } | null {
  try {
    const skillPath = path.join(process.cwd(), 'lib', 'prompts', `${skillName}.skill.md`)
    const fileContent = fs.readFileSync(skillPath, 'utf-8')
    
    // Parse frontmatter
    const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    
    if (!frontmatterMatch) {
      // No frontmatter, return entire content
      return {
        metadata: {},
        content: fileContent.trim(),
      }
    }
    
    const [, frontmatter, content] = frontmatterMatch
    
    // Parse frontmatter key-value pairs
    const metadata: Record<string, string> = {}
    const lines = frontmatter.split('\n')
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/)
      if (match) {
        const [, key, value] = match
        metadata[key] = value.trim()
      }
    }
    
    return {
      metadata,
      content: content.trim(),
    }
  } catch (error) {
    console.error(`Failed to load skill "${skillName}":`, error)
    return null
  }
}

/**
 * Get the system prompt content from a Skill
 * This extracts just the content part (without frontmatter) for use as a system prompt
 */
export function getSkillSystemPrompt(skillName: string): string | null {
  const skill = loadSkill(skillName)
  if (!skill) return null
  
  // The Skill content IS the system prompt
  return skill.content
}

