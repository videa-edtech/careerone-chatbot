/**
 * Skill Loader — Reads SKILL.md files and injects them into agent prompts
 *
 * Allows Skills to operate without the Claude Code CLI.
 * On server start, it reads SKILL.md from the .claude/skills/ directory
 * and includes them directly into the agent prompts.
 *
 * With this approach, running `npm install → npx tsx server/index.ts`
 * will make all Skills operational.
 */
import { readFile, readdir, stat } from "fs/promises";
import path from "path";

const SKILLS_DIR = path.resolve(".claude/skills");

// Cache — Load only once on server start
const skillCache = new Map<string, string>();

/**
 * Loads the SKILL.md content of a single Skill
 */
export async function loadSkill(skillName: string): Promise<string> {
  if (skillCache.has(skillName)) {
    return skillCache.get(skillName)!;
  }

  const skillPath = path.join(SKILLS_DIR, skillName, "SKILL.md");
  try {
    const content = await readFile(skillPath, "utf-8");
    skillCache.set(skillName, content);
    return content;
  } catch {
    console.warn(`[SkillLoader] Skill not found: ${skillName} (${skillPath})`);
    return "";
  }
}

/**
 * Loads multiple Skills and combines them into a single string
 */
export async function loadSkills(skillNames: string[]): Promise<string> {
  const sections: string[] = [];

  for (const name of skillNames) {
    const content = await loadSkill(name);
    if (content) {
      sections.push(`\n${"=".repeat(60)}\n## Skill: ${name}\n${"=".repeat(60)}\n${content}`);
    }
  }

  return sections.join("\n");
}

/**
 * Injects Skills content into the agent's base prompt to generate the final prompt
 */
export async function buildPromptWithSkills(
    basePrompt: string,
    skillNames: string[]
): Promise<string> {
  if (skillNames.length === 0) return basePrompt;

  const skillsContent = await loadSkills(skillNames);
  if (!skillsContent) return basePrompt;

  return `${basePrompt}

${"#".repeat(60)}
# Reference Skills (You MUST strictly adhere to the frameworks below)
${"#".repeat(60)}
${skillsContent}

**CRITICAL FINAL INSTRUCTION**: You must consume the skills above conceptually, but your final output to the user MUST be strictly in the language they used (English, Sinhala, or Tamil). Do not output Korean.`;
}

/**
 * Returns a list of all available Skills
 */
export async function listAvailableSkills(): Promise<string[]> {
  try {
    const entries = await readdir(SKILLS_DIR);
    const skills: string[] = [];

    for (const entry of entries) {
      const skillMd = path.join(SKILLS_DIR, entry, "SKILL.md");
      try {
        await stat(skillMd);
        skills.push(entry);
      } catch {
        // If SKILL.md doesn't exist, it's not a valid skill directory
      }
    }

    return skills.sort();
  } catch {
    return [];
  }
}

/**
 * Preloads all Skills (Called during server startup)
 */
export async function preloadAllSkills(): Promise<void> {
  const skills = await listAvailableSkills();
  let loaded = 0;

  for (const name of skills) {
    const content = await loadSkill(name);
    if (content) loaded++;
  }

  console.log(`[SkillLoader] Loaded ${loaded}/${skills.length} skills from ${SKILLS_DIR}`);
}
