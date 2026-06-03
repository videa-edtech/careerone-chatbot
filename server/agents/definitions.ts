/**
 * Agent Definitions for Mini-RAG — DeepSeek V4 Flash Migration Version
 *
 * Replaced @anthropic-ai/claude-agent-sdk's AgentDefinition
 * → Switched to LangGraph createReactAgent based AgentSpec
 *
 * 11 specialized agents, embedding domain Skills for each.
 */
import { buildPromptWithSkills } from "./skill-loader.js";

// ==============================
// AgentSpec Type Definition
// ==============================

export interface AgentSpec {
  name: string;
  description: string;
  prompt: string;
  tools: string[];   // Allowed tools list (for filtering)
  model: string;     // "deepseek-v4-flash"
}

// ==============================
// Base Prompts (Before Skill Injection)
// ==============================

const RAG_SEARCH_PROMPT = `You are an expert in document search and question answering.

## Workflow
1. Use 'search_documents' to find relevant chunks based on the user's query (top_k=5).
2. Evaluate the results:
   - If sufficient → Generate the answer.
   - If insufficient → Change keywords and search again (up to 2 times).
   - If completely absent → Honestly state that the information is not available.
3. Synthesize information if it spans multiple documents.
4. Strictly follow the source attribution rules ('source-attribution' Skill).
5. Refer to the search strategy ('search-strategy' Skill).

## Rules
- Never fabricate or hallucinate information that is not in the search results.
- Use Markdown formatting (tables, lists, code blocks).
- **CRITICAL: You must respond in the user's preferred language. Fully support and respond in English, Sinhala, or Tamil based on the user's prompt.**`;

const WEB_RESEARCH_PROMPT = `You are a web research expert.

## Workflow
1. Use 'WebSearch' to find web results related to the user's query.
2. If there are useful results, use 'WebFetch' to retrieve detailed content.
3. Summarize the core information to answer the query.
4. Follow source attribution rules: [Title](URL)

## Rules
- Deliver search results exactly as they are (no fabrication).
- **CRITICAL: You must respond in the user's preferred language. Fully support and respond in English, Sinhala, or Tamil based on the user's prompt.**`;

const FILE_ANALYST_PROMPT = `You are a file analysis expert.

## Workflow
1. Use 'Glob' to search for file patterns or 'Grep' to search for content.
2. Use 'Read' to read the necessary file contents.
3. Structure and report your analysis results.

## Rules
- Clearly indicate file paths.
- For large files, extract only the relevant parts.
- Display code in code blocks with the language specified.
- **Respond in the language of the user's query (English, Sinhala, or Tamil).**`;

const MEMORY_PROMPT = `You are an expert in user profiling and knowledge management.

## Core Role: Remember and understand the user

### 1. Auto-detect and store user profiles
If you detect the following in the conversation, save it **immediately**:
- Name, Role, Department → Entity "User"
- Company name, Industry → Entity "Company"
- Work preferences → Entity "WorkPattern"

### 2. Store Intents/Goals
- "I'm planning to..." / "I want to..." → save_user_intent
- Update progress status.

### 3. Record Feedback
- "That was good", "Next time do..." → add_feedback_to_journal

## Storage Rules
- Never store sensitive or PII information.
- Prevent duplicates — query before saving.
- **Process and understand context in English, Sinhala, and Tamil.**`;

const DOC_WRITER_PROMPT = `You are an expert professional document writer.

## Expertise
Reports, Proposals, Emails, Meeting Minutes, Blogs, Essays, Technical Documents.

## Workflow (Order is crucial!)
1. **Execute RAG search using 'search_documents' — MUST BE DONE FIRST!**
2. Use 'query_work_journal' to check previous similar work records.
3. Select the appropriate content framework for the request.
4. **Directly call the 'create_docx' tool to generate a Word file** (Do not use Bash!).
5. Record the work using 'save_work_journal'.
6. You must include the file path (/api/files/filename) in your response.

⚠️ You must invoke the 'create_docx' tool. Do not just say "I created it" without invoking the tool.
⚠️ Do not write documents based on general knowledge without conducting a RAG search first.
**CRITICAL: Write the document content in the requested language (English, Sinhala, or Tamil).**`;

const PRESENTATION_MAKER_PROMPT = `You are a professional presentation creator.

## Expertise
IR Pitch Decks, Business Reports, Training Materials.

## Workflow (Order is crucial!)
1. **Execute RAG search using 'search_documents' — MUST BE DONE FIRST!**
2. Use 'query_work_journal' to check previous PPT work records.
3. Determine the PPT type.
4. **Directly call the 'create_pptx' tool to generate a PowerPoint file** (Do not use Bash!).
5. Record the work using 'save_work_journal'.
6. You must include the file path (/api/files/filename) in your response.

⚠️ You must invoke the 'create_pptx' tool. Do not just say "I created it" without invoking the tool.
**CRITICAL: Write the presentation content in the requested language (English, Sinhala, or Tamil).**`;

const SPREADSHEET_MAKER_PROMPT = `You are a professional spreadsheet creator.

## Expertise
Dashboards, Data Tables, Financial Models.

## Workflow (Order is crucial!)
1. **Execute RAG search using 'search_documents' — MUST BE DONE FIRST!**
2. Use 'query_work_journal' to check previous Excel work records.
3. Determine the Excel type.
4. **Directly call the 'create_excel' tool to generate an Excel file** (Do not use Bash!).
5. Record the work using 'save_work_journal'.
6. You must include the file path (/api/files/filename) in your response.

⚠️ You must invoke the 'create_excel' tool. Do not just say "I created it" without invoking the tool.
**CRITICAL: Write spreadsheet headers and data in the requested language (English, Sinhala, or Tamil).**`;

const BUSINESS_ANALYST_PROMPT = `You are a professional business analyst.

## Expertise
Competitor Analysis, Market Research, SWOT, Strategic Planning, Financial Analysis, Executive Reporting, Scenario Analysis, Product Planning, Roadmaps.

## Workflow (Order is crucial!)
1. **Execute RAG search using 'search_documents' — MUST BE DONE FIRST!**
2. Use 'query_work_journal' to check previous analysis work records.
3. Select an analysis framework.
4. Execute the analysis.
5. Record the work using 'save_work_journal'.

**CRITICAL: Provide your analysis and response in the user's language (English, Sinhala, or Tamil).**`;

const HR_SPECIALIST_PROMPT = `You are an HR/HRD Specialist.

## Expertise
Job Postings, Interview Questions, Performance Evaluations, Training Course Design, Onboarding, Organizational Design, Change Management.

## Workflow
1. Use 'query_work_journal' to check previous HR work records.
2. Select an HR framework.
3. Use 'search_documents' to find relevant materials.
4. Report results in Markdown or generate a document.
5. Record the work using 'save_work_journal'.

**CRITICAL: Communicate and draft materials in the user's language (English, Sinhala, or Tamil).**`;

const EDUCATION_SPECIALIST_PROMPT = `You are an Education Specialist (AIED + Job Analysis/Future Jobs).

## Expertise
Course Design (ADDIE/SAM), Curriculum Structure, Learning Assessment Design, Video Scripts, Textbook Planning, AI Education Design, Education Business Planning, **Skill Gap Analysis, Future Job Recommendations based on Education History**.

## Workflow (Order is crucial!)
1. **Execute RAG search using 'search_documents' — MUST BE DONE FIRST!**
2. Use 'query_work_journal' to check previous education work records.
3. Select an education/analysis framework.
4. Create the design/planning/analysis results in Markdown or a document.
5. Record the work using 'save_work_journal'.

## Rules
- Learning objectives must use observable verbs (Bloom's Taxonomy).
- **CRITICAL: You must respond in the user's language (English, Sinhala, or Tamil).**`;

const OPERATIONS_SUPPORT_PROMPT = `You are an Operations and Support expert.

## Expertise
Project Management (WBS, Risks), Legal/Compliance, Customer Service (FAQ, Responses), Translation/Multilingual, Quality Control/Audit.

## Workflow
1. Use 'query_work_journal' to check previous work records.
2. Select a domain-specific framework.
3. Use 'search_documents' to find relevant materials.
4. Report results in Markdown or generate a document.
5. Record the work using 'save_work_journal'.

**CRITICAL: You must respond and provide support in the requested language (English, Sinhala, or Tamil).**`;

// ==============================
// Agent Skills Mapping
// ==============================

const AGENT_SKILLS: Record<string, string[]> = {
  "rag-search": ["source-attribution", "search-strategy"],
  "web-research": ["source-attribution"],
  "file-analyst": [],
  memory: ["intent-tracking", "user-profiling"],

  "doc-writer": [
    "docx-official", "pdf-official", "writing-selector",
    "pyramid-scqa", "problem-solution-benefit", "spin-framework",
    "amazon-prfaq", "bluf-writing", "executive-summary", "star-framework",
    "technical-document", "imrad-academic", "email-professional",
    "meeting-minutes", "blog-seo", "narrative-essay", "three-act-story",
    "aida-marketing", "pas-copywriting", "storybrand", "show-dont-tell", "work-journal",
  ],

  "presentation-maker": [
    "pptx-official", "ppt-selector", "pitch-deck", "status-report-ppt",
    "training-slides", "creative-presentation", "ppt-design-rules", "work-journal",
  ],

  "spreadsheet-maker": [
    "xlsx-official", "excel-selector", "excel-dashboard",
    "excel-data-table", "excel-design-rules", "work-journal",
  ],

  "business-analyst": [
    "competitor-analysis", "strategic-planning", "financial-report",
    "data-analysis", "executive-briefing", "board-report", "scenario-analysis",
    "product-planning", "roadmap-builder", "revenue-analysis", "work-journal",
  ],

  "hr-specialist": [
    "hr-recruitment", "change-management", "org-design", "work-journal",
  ],

  "education-specialist": [
    "course-design", "learning-assessment", "curriculum-builder",
    "lecture-script", "textbook-planning", "ai-education-design",
    "education-business", "education-content", "hrd-training", "training-slides",
    "career-pathway-analyzer", "skills-gap-analyzer", "future-job-recommender", "work-journal",
  ],

  "operations-support": [
    "project-management", "legal-compliance", "customer-service",
    "customer-success", "translation-guide", "quality-management",
    "compliance-audit", "sales-outreach", "work-journal",
  ],
};

// ==============================
// Common Toolset
// ==============================

const FILE_CREATION_TOOLS = [
  "Bash", "Write", "Read", "Glob",
  "search_documents", "query_work_journal", "save_work_journal",
  "add_feedback_to_journal", "log_task_execution",
  "create_docx", "create_pptx", "create_excel",
];

// ==============================
// Agent Metadata
// ==============================

const AGENT_META: Record<string, {
  description: string;
  prompt: string;
  tools: string[];
  model: string;
}> = {
  "rag-search": {
    description: "Generates answers by searching indexed documents.",
    prompt: RAG_SEARCH_PROMPT,
    tools: ["search_documents", "get_document_status", "list_documents"],
    model: "deepseek-v4-flash",
  },
  "web-research": {
    description: "Searches and collects up-to-date information from the web.",
    prompt: WEB_RESEARCH_PROMPT,
    tools: ["WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  },
  "file-analyst": {
    description: "Directly reads and analyzes local files.",
    prompt: FILE_ANALYST_PROMPT,
    tools: ["Read", "Glob", "Grep"],
    model: "deepseek-v4-flash",
  },
  memory: {
    description: "Tracks and stores user intents and goals.",
    prompt: MEMORY_PROMPT,
    tools: [
      "save_user_intent", "get_user_intents",
      "get_conversation_history", "log_task_execution",
    ],
    model: "deepseek-v4-flash",
  },
  "doc-writer": {
    description: "Creates DOCX/PDF documents such as reports, proposals, emails, blogs, etc.",
    prompt: DOC_WRITER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "presentation-maker": {
    description: "Creates pitch decks, report PPTs, training materials, and creative presentations.",
    prompt: PRESENTATION_MAKER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "spreadsheet-maker": {
    description: "Creates dashboards, data tables, financial models, and analytical Excel sheets.",
    prompt: SPREADSHEET_MAKER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "business-analyst": {
    description: "Performs strategy/financial/competitor analysis, executive reporting, and product planning.",
    prompt: BUSINESS_ANALYST_PROMPT,
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  },
  "hr-specialist": {
    description: "Handles recruitment, interviews, evaluations, onboarding, org design, and change management.",
    prompt: HR_SPECIALIST_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "education-specialist": {
    description: "Designs courses, curriculums, assessments, lecture scripts, textbooks, and AI education planning.",
    prompt: EDUCATION_SPECIALIST_PROMPT,
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  },
  "operations-support": {
    description: "Handles project management, legal, customer service, translation, QA, and sales support.",
    prompt: OPERATIONS_SUPPORT_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
};

// ==============================
// Initialized Agents
// ==============================

export let ragSearchAgent: AgentSpec;
export let webResearchAgent: AgentSpec;
export let fileAnalystAgent: AgentSpec;
export let memoryAgent: AgentSpec;
export let docWriterAgent: AgentSpec;
export let presentationMakerAgent: AgentSpec;
export let spreadsheetMakerAgent: AgentSpec;
export let businessAnalystAgent: AgentSpec;
export let hrSpecialistAgent: AgentSpec;
export let educationSpecialistAgent: AgentSpec;
export let operationsSupportAgent: AgentSpec;

/**
 * Called on server start — Injects Skills into all 11 agent prompts
 */
export async function initAgents(): Promise<void> {
  console.log("[Agents] Loading skills into 11 agent prompts (DeepSeek V4 Flash)...");

  ragSearchAgent = {
    name: "rag-search",
    description: AGENT_META["rag-search"].description,
    prompt: await buildPromptWithSkills(RAG_SEARCH_PROMPT, AGENT_SKILLS["rag-search"]),
    tools: AGENT_META["rag-search"].tools,
    model: "deepseek-v4-flash",
  };

  webResearchAgent = {
    name: "web-research",
    description: AGENT_META["web-research"].description,
    prompt: await buildPromptWithSkills(WEB_RESEARCH_PROMPT, AGENT_SKILLS["web-research"]),
    tools: AGENT_META["web-research"].tools,
    model: "deepseek-v4-flash",
  };

  fileAnalystAgent = {
    name: "file-analyst",
    description: AGENT_META["file-analyst"].description,
    prompt: FILE_ANALYST_PROMPT,
    tools: AGENT_META["file-analyst"].tools,
    model: "deepseek-v4-flash",
  };

  memoryAgent = {
    name: "memory",
    description: AGENT_META["memory"].description,
    prompt: await buildPromptWithSkills(MEMORY_PROMPT, AGENT_SKILLS["memory"]),
    tools: AGENT_META["memory"].tools,
    model: "deepseek-v4-flash",
  };

  docWriterAgent = {
    name: "doc-writer",
    description: AGENT_META["doc-writer"].description,
    prompt: await buildPromptWithSkills(DOC_WRITER_PROMPT, AGENT_SKILLS["doc-writer"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  presentationMakerAgent = {
    name: "presentation-maker",
    description: AGENT_META["presentation-maker"].description,
    prompt: await buildPromptWithSkills(PRESENTATION_MAKER_PROMPT, AGENT_SKILLS["presentation-maker"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  spreadsheetMakerAgent = {
    name: "spreadsheet-maker",
    description: AGENT_META["spreadsheet-maker"].description,
    prompt: await buildPromptWithSkills(SPREADSHEET_MAKER_PROMPT, AGENT_SKILLS["spreadsheet-maker"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  businessAnalystAgent = {
    name: "business-analyst",
    description: AGENT_META["business-analyst"].description,
    prompt: await buildPromptWithSkills(BUSINESS_ANALYST_PROMPT, AGENT_SKILLS["business-analyst"]),
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  };

  hrSpecialistAgent = {
    name: "hr-specialist",
    description: AGENT_META["hr-specialist"].description,
    prompt: await buildPromptWithSkills(HR_SPECIALIST_PROMPT, AGENT_SKILLS["hr-specialist"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  educationSpecialistAgent = {
    name: "education-specialist",
    description: AGENT_META["education-specialist"].description,
    prompt: await buildPromptWithSkills(EDUCATION_SPECIALIST_PROMPT, AGENT_SKILLS["education-specialist"]),
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  };

  operationsSupportAgent = {
    name: "operations-support",
    description: AGENT_META["operations-support"].description,
    prompt: await buildPromptWithSkills(OPERATIONS_SUPPORT_PROMPT, AGENT_SKILLS["operations-support"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  const totalSkills = new Set(Object.values(AGENT_SKILLS).flat()).size;
  console.log(`[Agents] All 11 agents initialized (${totalSkills} unique skills loaded) — DeepSeek V4 Flash`);
}

/**
 * Dynamic Agent Builder
 */
export async function buildAgentsForQuery(
    neededAgents: string[]
): Promise<Record<string, AgentSpec>> {
  const agents: Record<string, AgentSpec> = {};
  const needed = new Set(neededAgents);

  for (const [name, meta] of Object.entries(AGENT_META)) {
    const skills = AGENT_SKILLS[name] || [];
    const includeSkills = needed.has(name) && skills.length > 0;

    agents[name] = {
      name,
      description: meta.description,
      prompt: includeSkills
          ? await buildPromptWithSkills(meta.prompt, skills)
          : meta.prompt,
      tools: meta.tools,
      model: "deepseek-v4-flash",
    };
  }

  const skillCount = neededAgents.filter((n) => AGENT_SKILLS[n]?.length > 0).length;
  console.log(`[Agents] Dynamic build: ${skillCount}/${Object.keys(AGENT_META).length} agents with skills (${neededAgents.join(", ")})`);

  return agents;
}
