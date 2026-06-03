/**
 * Skill Router — Predicts the necessary agents based on the user's message
 *
 * Calculates matching scores based on Registry keywords
 * to load Skills ONLY for the top N agents.
 *
 * Cost Reduction: 22K tokens (loading all) → Only necessary Skills (~5K)
 */
import { AGENT_REGISTRY } from "./registry.js";

/**
 * Multilingual Synonym Expansion — Maps Sinhala, Tamil, and other synonyms
 * to base English keywords so they match with registry.ts entries.
 */
const MULTILINGUAL_MAP: Record<string, string[]> = {
  // Education / HR
  "education": ["අධ්‍යාපනය", "கல்வி", "training", "learning", "교육"],
  "curriculum": ["විෂය නිර්දේශය", "பாடத்திட்டம்", "syllabus", "커리큘럼"],
  "job analysis": ["රැකියා විශ්ලේෂණය", "வேலை பகுப்பாய்வு", "competency analysis", "직무 분석"],
  "skill gap": ["නිපුණතා පරතරය", "திறன் இடைவெளி", "skills gap", "스킬 갭"],
  "future job": ["අනාගත රැකියාව", "எதிர்கால வேலை", "career path", "미래 일자리"],
  "recruit": ["බඳවා ගැනීම", "ஆள்சேர்ப்பு", "hiring", "채용"],

  // Document Creation
  "report": ["වාර්තාව", "அறிக்கை", "보고서"],
  "presentation": ["ඉදිරිපත් කිරීම", "விளக்கக்காட்சி", "slides", "PPT"],
  "excel": ["එක්සෙල්", "எக்செல்", "spreadsheet", "엑셀"],

  // Analysis
  "competitor": ["තරඟකරු", "போட்டியாளர்", "competitive", "경쟁사"],
  "strategy": ["උපාය", "உத்தி", "strategic", "전략"],
  "finance": ["මූල්‍ය", "நிதி", "financial", "재무"],
  "data analysis": ["දත්ත විශ්ලේෂණය", "தரவு பகுப்பாய்வு", "analytics", "데이터 분석"],

  // General / Operations
  "translate": ["පරිවර්තනය", "மொழிபெயர்", "translation", "번역"],
  "summary": ["සාරාංශය", "சுருக்கம்", "summarize", "요약"],
  "search": ["සොයන්න", "தேடு", "find", "검색"],
  "email": ["විද්‍යුත් තැපෑල", "ඊමේල්", "மின்னஞ்சல்", "이메일"],
  "project": ["ව්‍යාපෘතිය", "திட்டம்", "프로젝트"],
};

function expandMultilingual(lowerMsg: string): string {
  let expanded = lowerMsg;
  for (const [englishBaseKeyword, synonyms] of Object.entries(MULTILINGUAL_MAP)) {
    for (const syn of synonyms) {
      // toLowerCase handles English/Korean well, Sinhala/Tamil chars are unaffected
      if (lowerMsg.includes(syn.toLowerCase())) {
        expanded += ` ${englishBaseKeyword}`;
        break; // One match per category is enough
      }
    }
  }
  return expanded;
}

/**
 * Returns a list of required agent names based on the user's message
 * @param message - User's message
 * @param maxAgents - Maximum number of agents to return (Default 3)
 * @returns Array of matched agent names (sorted by highest score)
 */
export function predictNeededAgents(message: string, maxAgents = 3): string[] {
  // Multilingual support: Expand message with base English keywords before matching
  const lowerMsg = expandMultilingual(message.toLowerCase());

  const scores: { name: string; score: number }[] = [];

  for (const entry of AGENT_REGISTRY) {
    let score = 0;

    // Keyword matching (Most important)
    for (const kw of entry.keywords) {
      if (lowerMsg.includes(kw.toLowerCase())) {
        score += 10;
      }
    }

    // Capabilities matching
    for (const cap of entry.capabilities) {
      if (lowerMsg.includes(cap.toLowerCase())) {
        score += 5;
      }
    }

    if (score > 0) {
      scores.push({ name: entry.name, score });
    }
  }

  // Sort by highest score
  scores.sort((a, b) => b.score - a.score);

  // Return Top N agents
  const result = scores.slice(0, maxAgents).map((s) => s.name);

  // 'rag-search' is always included (High probability of document queries)
  if (!result.includes("rag-search")) result.push("rag-search");

  // Include 'memory' only if profiling keywords exist (Saves MCP server start costs)
  const memoryKeywords = [
    // English
    "remember", "previously", "save", "my name", "my company", "our company", "goal", "planning to",
    // Sinhala
    "මතක තබා ගන්න", "මීට පෙර", "සුරකින්න", "මගේ නම", "මගේ සමාගම", "ඉලක්කය", "සැලසුම් කරනවා",
    // Tamil
    "நினைவில் கொள்", "முன்பு", "சேமி", "என் பெயர்", "எனது நிறுவனம்", "இலக்கு", "திட்டமிட்டுள்ளேன்",
    // Legacy Korean (optional, kept for safe fallback)
    "기억", "이전에", "저장", "내 이름", "우리 회사", "목표", "하려고"
  ];

  const needsMemory = memoryKeywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
  if (needsMemory && !result.includes("memory")) result.push("memory");

  return result;
}
