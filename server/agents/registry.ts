/**
 * Agent Registry — Agent Metadata + Routing Rules
 *
 * Used by the orchestrator to select the best agent based on natural language requests.
 *
 * Advantages:
 * - Single Source of Truth for routing logic.
 * - Keeps the orchestrator prompt concise.
 */

export interface AgentRegistryEntry {
  name: string;
  description: string;
  /** Business categories handled by this agent */
  capabilities: string[];
  /** English keywords for routing (AI will semantically match Sinhala/Tamil inputs to these) */
  keywords: string[];
  /** Output format */
  outputType: "text" | "docx" | "pdf" | "pptx" | "xlsx" | "mixed";
  /** Group — Orchestrator classifies by group first, then selects the agent */
  group: "information" | "document" | "analysis" | "specialist";
}

/**
 * Agent Registry
 */
export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  // ===== Information Group =====
  {
    name: "rag-search",
    description: "Search and answer based on uploaded/indexed documents",
    capabilities: ["Document search", "RAG Q&A", "Document summarization"],
    keywords: ["document", "search", "find", "uploaded", "file", "content", "summarize"],
    outputType: "text",
    group: "information",
  },
  {
    name: "web-research",
    description: "Search and collect the latest information from the web",
    capabilities: ["Web search", "Latest info", "Trend research", "URL scraping"],
    keywords: ["latest", "recent", "current", "news", "trend", "search", "internet", "web"],
    outputType: "text",
    group: "information",
  },
  {
    name: "file-analyst",
    description: "Directly read and analyze local files",
    capabilities: ["File analysis", "Code analysis", "Config check"],
    keywords: ["file", "code", "config", "analyze", "read"],
    outputType: "text",
    group: "information",
  },
  {
    name: "memory",
    description: "Track user intents/goals and remember knowledge",
    capabilities: ["Save intent", "Track goal", "Remember context"],
    keywords: ["remember", "save", "goal", "intent", "previous", "last time", "planning to"],
    outputType: "text",
    group: "information",
  },

  // ===== Document Creation Group =====
  {
    name: "doc-writer",
    description: "Write reports, proposals, emails, minutes, blogs, essays → DOCX/PDF",
    capabilities: [
      "Report writing", "Proposal writing", "Email writing", "Meeting minutes",
      "Blog post", "Essay", "Academic paper", "Technical doc", "Marketing copy",
      "Newsletter", "Announcement",
    ],
    keywords: [
      "report", "proposal", "email", "minutes", "blog", "essay", "paper",
      "technical document", "copywriting", "write", "DOCX", "PDF", "Word",
      "AIDA", "SCQA", "SPIN", "STAR", "BLUF",
    ],
    outputType: "docx",
    group: "document",
  },
  {
    name: "presentation-maker",
    description: "Create pitch decks, reports, training materials → PPTX",
    capabilities: [
      "Pitch deck", "Business report PPT", "Training material", "Creative presentation", "IR material",
    ],
    keywords: [
      "PPT", "PPTX", "PowerPoint", "presentation", "slide", "pitch deck", "training", "IR",
    ],
    outputType: "pptx",
    group: "document",
  },
  {
    name: "spreadsheet-maker",
    description: "Create dashboards, data tables, financial models → XLSX",
    capabilities: [
      "Dashboard", "Data table", "Financial model", "Analysis sheet", "Charts/Graphs", "Pivot table",
    ],
    keywords: [
      "Excel", "XLSX", "spreadsheet", "table", "dashboard", "data", "chart", "graph", "pivot",
    ],
    outputType: "xlsx",
    group: "document",
  },

  // ===== Analysis Group =====
  {
    name: "business-analyst",
    description: "Strategy/Financial/Competitor/Market analysis, Executive reports, Scenarios, Roadmaps",
    capabilities: [
      "Competitor analysis", "Market research", "SWOT", "Strategic planning",
      "Financial analysis", "Executive reporting", "Board report", "Scenario analysis",
      "Product planning", "Roadmap", "Revenue analysis", "Business plan",
      "OKR", "KPI", "Investment proposal", "M&A",
    ],
    keywords: [
      "competitor", "market", "SWOT", "strategy", "business plan", "OKR",
      "finance", "budget", "revenue", "MRR", "ARR", "LTV", "CAC",
      "executive", "CEO", "board", "scenario", "wargame",
      "product", "PRD", "roadmap", "backlog", "business model", "investment",
    ],
    outputType: "mixed",
    group: "analysis",
  },

  // ===== Specialist Group =====
  {
    name: "hr-specialist",
    description: "Recruiting, Interviews, Evaluations, Onboarding, Org Design, Change Management",
    capabilities: [
      "Job posting", "Interview questions", "Performance review",
      "Onboarding", "Org design", "Change management",
    ],
    keywords: [
      "recruit", "JD", "interview", "evaluation", "performance",
      "onboarding", "org chart", "R&R", "RACI", "change management", "ADKAR",
    ],
    outputType: "mixed",
    group: "specialist",
  },
  {
    name: "education-specialist",
    description: "Course design, Curriculum, Assessment, Scripts, AI Education, Job/Skill Analysis",
    capabilities: [
      "Course design", "Curriculum", "Assessment design",
      "Video script", "Textbook planning", "AI education design",
      "Training (HRD)", "Quizzes/Exams", "Skill gap analysis", "Future job prediction",
    ],
    keywords: [
      "education", "course", "curriculum", "learning", "lecture",
      "script", "textbook", "exam", "quiz", "assessment", "rubric",
      "ADDIE", "SAM", "Bloom", "AI education", "AIED", "LMS", "e-learning",
      "job analysis", "skill gap", "competency", "future jobs", "career path",
    ],
    outputType: "mixed",
    group: "specialist",
  },
  {
    name: "operations-support",
    description: "PM, Legal, Customer Service, Translation, QA, Sales Support",
    capabilities: [
      "Project management", "Legal/Compliance", "Customer service",
      "Translation", "Quality assurance", "Audit", "Sales support",
    ],
    keywords: [
      "project", "WBS", "sprint", "risk", "Gantt",
      "contract", "NDA", "compliance", "audit", "ISO", "GDPR",
      "FAQ", "customer support", "CS", "escalation",
      "translate", "multilingual", "localization",
      "sales", "cold email", "quality", "CAPA",
    ],
    outputType: "mixed",
    group: "specialist",
  },
];

/**
 * Converts the registry into text for the Orchestrator's system prompt.
 * * 2-Step Routing:
 * Step 1: Group classification (information/document/analysis/specialist)
 * Step 2: Agent selection within the group (Semantic matching of keywords + capabilities)
 */
export function buildRoutingPrompt(): string {
  const groups: Record<string, AgentRegistryEntry[]> = {};
  for (const entry of AGENT_REGISTRY) {
    if (!groups[entry.group]) groups[entry.group] = [];
    groups[entry.group].push(entry);
  }

  const groupNames: Record<string, string> = {
    information: "Information Retrieval",
    document: "Document/File Creation",
    analysis: "Business Analysis",
    specialist: "Specialized Operations",
  };

  let prompt = "## Agent Routing Guide\n\n";
  prompt += "### 2-Step Routing: Select Group first → then select Agent within the group\n\n";

  for (const [group, entries] of Object.entries(groups)) {
    prompt += `#### ${groupNames[group] || group}\n`;
    for (const entry of entries) {
      prompt += `- **${entry.name}**: ${entry.description}\n`;
      prompt += `  Keywords: ${entry.keywords.slice(0, 10).join(", ")}\n`;
    }
    prompt += "\n";
  }

  prompt += `### Routing Rules
1. Uploaded document queries → rag-search (Highest Priority)
2. "Latest/Recent/Current" info requests → web-research
3. Mentions of file paths or code → file-analyst
4. "I'm planning to" / referencing past context → memory
5. Requests to create DOCX/PPT/Excel → Corresponding agent in 'document' group
6. Analysis/Strategy/Finance/Management → business-analyst
7. HR/Recruiting/Organization → hr-specialist
8. Education/Curriculum/Exams/AI Education → education-specialist
9. PM/Legal/CS/Translation/QA/Sales → operations-support
10. Complex requests → Delegate to multiple agents in sequence
11. General conversation → Answer directly (No agent needed)

**CRITICAL MULTILINGUAL RULE**: The user may request in English, Sinhala, or Tamil. You must semantically match their intent to the English keywords above to route correctly. ALWAYS output your final response in the user's language.`;

  return prompt;
}
