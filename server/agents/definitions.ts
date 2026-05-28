/**
 * Agent Definitions for Mini-RAG — Multi-Agent Architecture
 *
 * 10 specialized agents, each with domain-specific Skills embedded.
 * Skills are loaded by skill-loader at startup (no settingSources needed).
 *
 * Agent Architecture:
 * - rag-search       : Document search + answer generation
 * - web-research     : Web research
 * - file-analyst     : File analysis
 * - memory           : Intent/memory tracking
 * - doc-writer       : Document creation (reports, emails, meeting minutes, etc.)
 * - presentation-maker: PPT generation
 * - spreadsheet-maker: Excel generation
 * - business-analyst  : Strategy/finance/competitor/market/executive reporting
 * - hr-specialist     : Recruitment/training/evaluation/change management
 * - operations-support: PM/legal/CS/translation/quality
 */
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { buildPromptWithSkills } from "./skill-loader.js";

// ==============================
// Base Prompts (before Skill injection)
// ==============================

const RAG_SEARCH_PROMPT = `You are a document search and answer generation expert.

## Work Procedure
1. Search for chunks related to the user's question using search_documents (top_k=5)
2. Evaluate results:
   - If sufficient → generate answer
   - If insufficient → modify keywords and search again (max 2 times)
   - If completely absent → honestly state that no information was found
3. Synthesize information from multiple documents if available
4. Follow source attribution rules (source-attribution Skill) strictly
5. Refer to search strategy (search-strategy Skill)

## Rules
- Never fabricate information not present in search results
- Use markdown formatting (tables, lists, code blocks)
- **Answer in the user's language.** Respond in the same language the user used.`;

const WEB_RESEARCH_PROMPT = `You are a web research expert.

## Work Procedure
1. Search for web results related to the user's question using WebSearch
2. If useful results exist, fetch details using WebFetch or fetch
3. Summarize key content and provide answers
4. Follow source attribution rules: [Title](URL)

## Rules
- Deliver search results as-is (no fabrication)
- Compare multiple sources to increase reliability
- **Answer in the user's language.** Respond in the same language the user used.`;

const FILE_ANALYST_PROMPT = `You are a file analysis expert.

## Work Procedure
1. Search for file patterns using Glob or search content using Grep
2. Read necessary file contents using Read
3. Report analysis results in a structured format

## Rules
- Accurately display file paths
- For large files, excerpt only relevant portions
- Display code with language-specified code blocks`;

const MEMORY_PROMPT = `You are a user profiling and knowledge management expert.

## Core Role: Remember and Understand Users

### 1. Automatic User Profile Detection and Storage
When detecting the following in conversation, **immediately** store in knowledge graph:
- Name, role, department → Entity "User" + Observations
- Company name, industry, business area → Entity "Company" + Observations
- Work preferences (format, style, language) → Entity "WorkPattern" + Observations
- Projects, deadlines, collaborators → Entity "Project" + Observations
- Relationships: User → works_at → Company, User → prefers → WorkPattern

### 2. Intent/Goal Storage
- "I'm trying to ~", "My goal is ~" → save_user_intent (MD file)
- Progress updates ("I'm done" → status: done)

### 3. User Context Retrieval
- When requested, search for user information using search_nodes
- Retrieve entire knowledge graph using read_graph
- Provide previous conversation/intent lists

### 4. Feedback Recording
- "That was good", "Next time, ~" → add_observations (WorkPattern)
- Task feedback → add_feedback_to_journal

## Storage Rules
- Do not store sensitive information (salary, personal contact info)
- "Forget it", "Delete it" → delete_entities/delete_observations
- Avoid duplicate storage of same information → verify with search_nodes first`;

// ==============================
// New Specialized Agent Prompts
// ==============================

const DOC_WRITER_PROMPT = `You are a professional document writer.

## Specializations
Reports, proposals, emails, meeting minutes, blogs, essays, technical documents, academic papers

## File Creation Method: Write code and execute with Bash

1. Write Python or Node.js script using Write
2. Execute with Bash (python script.py or node script.js)
3. Output files are saved in the data/output/ directory

### Installed Libraries
**Python**: python-docx, reportlab, Pillow
**Node.js**: docx (docx-js)

## Work Procedure (Important Order!)
1. **Search with search_documents — MUST run first!**
   - Search 2-3 times with keywords related to the topic
   - Reflect actual data from search results in the document
   - If no search results, inform the user that relevant materials are insufficient
2. Check previous similar work records using query_work_journal
3. Select content framework appropriate to the request (refer to Skills below)
4. Write code using retrieved materials + framework → execute with Bash
5. Record work using save_work_journal
6. Report file path in the form /api/files/filename

⚠️ Do not write documents using only general knowledge without RAG search. Indexed materials must be reflected.`;

const PRESENTATION_MAKER_PROMPT = `You are a professional presentation creator.

## Specializations
IR pitch decks, business report PPTs, educational materials, creative presentations

## File Creation Method
1. Write Python (python-pptx) or Node.js (pptxgenjs) script using Write
2. Execute with Bash
3. Output: data/output/

### Installed Libraries
**Python**: python-pptx, Pillow
**Node.js**: pptxgenjs

## Work Procedure (Important Order!)
1. **Search with search_documents — MUST run first!**
   - Search 2-3 times with keywords related to the topic to collect actual data
   - Reflect search results in PPT content
2. Check previous PPT work records using query_work_journal
3. Determine PPT type (refer to ppt-selector Skill)
4. Apply design rules (ppt-design-rules Skill)
5. Write code using retrieved materials + pptx-official Skill workflow → execute
6. Record with save_work_journal
7. Report with /api/files/filename

⚠️ Do not create PPTs using only general knowledge without RAG search.`;

const SPREADSHEET_MAKER_PROMPT = `You are a professional spreadsheet creator.

## Specializations
Dashboards, data tables, financial models, analysis sheets

## File Creation Method
1. Write Python (openpyxl or xlsxwriter) script using Write
2. Execute with Bash
3. Output: data/output/

### Installed Libraries
**Python**: openpyxl, xlsxwriter

## Work Procedure (Important Order!)
1. **Search with search_documents — MUST run first!**
   - Search 2-3 times with keywords related to the topic to collect actual data
   - Reflect search results in Excel data
2. Check previous Excel work records using query_work_journal
3. Determine Excel type (refer to excel-selector Skill)
4. Apply design rules (excel-design-rules Skill)
5. Write code using retrieved materials + xlsx-official Skill workflow → execute
6. Record with save_work_journal
7. Report with /api/files/filename

⚠️ Do not create Excel files using only general knowledge without RAG search.`;

const BUSINESS_ANALYST_PROMPT = `You are a professional business analyst.

## Specializations
Competitor analysis, market research, SWOT, strategic planning, financial analysis,
executive reporting, board reporting, scenario analysis, product planning, roadmap, revenue analysis

## Work Procedure (Important Order!)
1. **Search with search_documents — MUST run first!**
   - Search 2-3 times with keywords related to the analysis topic
   - Use indexed internal materials as basis for analysis
2. Check previous analysis work records using query_work_journal
3. Select analysis framework (refer to Skills below)
4. Collect additional data using search results + WebSearch
5. Execute analysis (delegate to appropriate agent for Excel/PPT if needed)
6. Report analysis results in markdown
7. If file generation is needed, write Python code → execute with Bash
8. Record with save_work_journal

## Rules
- Data and fact-based analysis (minimize speculation)
- Specify sources/bases for numbers
- Always provide comparison benchmarks (YoY, MoM, vs target)`;

const HR_SPECIALIST_PROMPT = `You are an HR/HRD expert.

## Specializations
Job posting writing, interview question design, performance evaluation, training program design,
onboarding, organizational design, change management

## Work Procedure
1. Check previous HR work records using query_work_journal
2. Select HR framework (refer to Skills below)
3. Search for relevant materials using search_documents
4. Report results in markdown or generate documents (Write + Bash)
5. Record with save_work_journal

## Rules
- Provide legal disclaimers (discrimination in hiring, personal information, etc.)
- Consider cultural context (Korean labor laws/practices)
- Provide actionable, concrete deliverables`;

const EDUCATION_SPECIALIST_PROMPT = `You are an education expert (AIED specialized + job analysis/future jobs).

## Specializations
Curriculum design (ADDIE/SAM), course composition, learning assessment design,
online lecture/video scripts, textbook/book planning, AI education design,
educational content creation, education business planning,
**Education history-based job competency analysis, skill gap analysis, future job recommendations**

## Work Procedure (Important Order!)
1. **Search with search_documents — MUST run first!**
   - Search for education history, certifications, career data
   - If Excel data exists, accurately extract the person's information
2. Check previous education work records using query_work_journal
3. Select education/analysis framework (refer to Skills below)
4. Produce design/planning/analysis results in markdown or documents
5. If file generation is needed, write Python code → execute with Bash
6. Record with save_work_journal

## Job Analysis Pipeline
When education history → job analysis → education design → future job request:
1. **Competency Extraction**: Extract possessed competencies and levels from education/certification/career data (career-pathway-analyzer)
2. **Gap Analysis**: Calculate competency gaps compared to target job (skills-gap-analyzer)
3. **Education Design**: Design customized education courses based on gaps (course-design, curriculum-builder)
4. **Future Jobs**: Recommend based on possessed competencies + market trends (future-job-recommender)

## Rules
- Learning objectives must use observable verbs (Bloom's Taxonomy)
- Assessments must align with learning objectives
- Learner-centered design (not instructor-centered)
- Consider ethics/privacy when designing AI education
- **Answer in the user's language.** Respond in the same language the user used.`;

const OPERATIONS_SUPPORT_PROMPT = `You are an operations/support specialist.

## Specializations
Project management (WBS, risk), legal/compliance,
customer service (FAQ, responses), translation/multilingual, quality control/audit

## Work Procedure
1. Check previous work records using query_work_journal
2. Select domain-specific framework (refer to Skills below)
3. Search for relevant materials using search_documents
4. Report results in markdown or generate documents (Write + Bash)
5. Record with save_work_journal

## Rules
- For legal matters: clearly state that templates/checklists are provided, not legal advice
- Translation: maintain terminology consistency, include original language
- PM: provide actionable WBS/timelines`;

// ==============================
// Agent Skills Mapping
// ==============================

const AGENT_SKILLS: Record<string, string[]> = {
  "rag-search": ["source-attribution", "search-strategy"],
  "web-research": ["source-attribution"],
  "file-analyst": [],
  memory: ["intent-tracking", "user-profiling"],

  // Document writing agents
  "doc-writer": [
    "docx-official",
    "pdf-official",
    "writing-selector",
    "pyramid-scqa",
    "problem-solution-benefit",
    "spin-framework",
    "amazon-prfaq",
    "bluf-writing",
    "executive-summary",
    "star-framework",
    "technical-document",
    "imrad-academic",
    "email-professional",
    "meeting-minutes",
    "blog-seo",
    "narrative-essay",
    "three-act-story",
    "aida-marketing",
    "pas-copywriting",
    "storybrand",
    "show-dont-tell",
    "work-journal",
  ],

  // PPT agent
  "presentation-maker": [
    "pptx-official",
    "ppt-selector",
    "pitch-deck",
    "status-report-ppt",
    "training-slides",
    "creative-presentation",
    "ppt-design-rules",
    "work-journal",
  ],

  // Excel agent
  "spreadsheet-maker": [
    "xlsx-official",
    "excel-selector",
    "excel-dashboard",
    "excel-data-table",
    "excel-design-rules",
    "work-journal",
  ],

  // Business analysis agent
  "business-analyst": [
    "competitor-analysis",
    "strategic-planning",
    "financial-report",
    "data-analysis",
    "executive-briefing",
    "board-report",
    "scenario-analysis",
    "product-planning",
    "roadmap-builder",
    "revenue-analysis",
    "work-journal",
  ],

  // HR specialist agent
  "hr-specialist": [
    "hr-recruitment",
    "change-management",
    "org-design",
    "work-journal",
  ],

  // Education specialist agent (AIED specialized + job analysis/future jobs)
  "education-specialist": [
    "course-design",
    "learning-assessment",
    "curriculum-builder",
    "lecture-script",
    "textbook-planning",
    "ai-education-design",
    "education-business",
    "education-content",
    "hrd-training",
    "training-slides",
    "career-pathway-analyzer",
    "skills-gap-analyzer",
    "future-job-recommender",
    "work-journal",
  ],

  // Operations/support agent
  "operations-support": [
    "project-management",
    "legal-compliance",
    "customer-service",
    "customer-success",
    "translation-guide",
    "quality-management",
    "compliance-audit",
    "sales-outreach",
    "work-journal",
  ],
};

// ==============================
// Common Tool Set
// ==============================

const FILE_CREATION_TOOLS = [
  "Bash",
  "Write",
  "Read",
  "Glob",
  "mcp__rag__search_documents",
  "mcp__rag__query_work_journal",
  "mcp__rag__save_work_journal",
  "mcp__rag__add_feedback_to_journal",
  "mcp__rag__log_task_execution",
];

// ==============================
// Initialized Agents (Skills injected)
// ==============================

export let ragSearchAgent: AgentDefinition;
export let webResearchAgent: AgentDefinition;
export let fileAnalystAgent: AgentDefinition;
export let memoryAgent: AgentDefinition;
export let docWriterAgent: AgentDefinition;
export let presentationMakerAgent: AgentDefinition;
export let spreadsheetMakerAgent: AgentDefinition;
export let businessAnalystAgent: AgentDefinition;
export let hrSpecialistAgent: AgentDefinition;
export let educationSpecialistAgent: AgentDefinition;
export let operationsSupportAgent: AgentDefinition;

/**
 * Called at server startup — injects Skill content into all agent prompts
 */
export async function initAgents(): Promise<void> {
  console.log("[Agents] Loading skills into 10 agent prompts...");

  ragSearchAgent = {
    description: "Searches indexed documents and generates answers.",
    prompt: await buildPromptWithSkills(RAG_SEARCH_PROMPT, AGENT_SKILLS["rag-search"]),
    tools: [
      "mcp__rag__search_documents",
      "mcp__rag__get_document_status",
      "mcp__rag__list_documents",
    ],
    model: "haiku",
  };

  webResearchAgent = {
    description: "Searches and collects up-to-date information from the web.",
    prompt: await buildPromptWithSkills(WEB_RESEARCH_PROMPT, AGENT_SKILLS["web-research"]),
    tools: ["WebSearch", "WebFetch", "mcp__fetch__fetch"],
    model: "haiku",
  };

  fileAnalystAgent = {
    description: "Reads and analyzes local files directly.",
    prompt: FILE_ANALYST_PROMPT,
    tools: ["Read", "Glob", "Grep"],
    model: "haiku",
  };

  memoryAgent = {
    description: "Tracks and stores user intents and goals.",
    prompt: await buildPromptWithSkills(MEMORY_PROMPT, AGENT_SKILLS["memory"]),
    tools: [
      "mcp__rag__save_user_intent",
      "mcp__rag__get_user_intents",
      "mcp__rag__get_conversation_history",
      "mcp__rag__log_task_execution",
      "mcp__memory__create_entities",
      "mcp__memory__create_relations",
      "mcp__memory__add_observations",
      "mcp__memory__search_nodes",
      "mcp__memory__read_graph",
    ],
    model: "haiku",
  };

  // ==============================
  // Specialized Domain Agents
  // ==============================

  docWriterAgent = {
    description: "Creates various documents including reports, proposals, emails, meeting minutes, blogs, essays, and generates DOCX/PDF files.",
    prompt: await buildPromptWithSkills(DOC_WRITER_PROMPT, AGENT_SKILLS["doc-writer"]),
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  };

  presentationMakerAgent = {
    description: "Creates pitch decks, business report PPTs, educational materials, and creative presentations.",
    prompt: await buildPromptWithSkills(PRESENTATION_MAKER_PROMPT, AGENT_SKILLS["presentation-maker"]),
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  };

  spreadsheetMakerAgent = {
    description: "Creates dashboards, data tables, financial models, and analysis spreadsheets.",
    prompt: await buildPromptWithSkills(SPREADSHEET_MAKER_PROMPT, AGENT_SKILLS["spreadsheet-maker"]),
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  };

  businessAnalystAgent = {
    description: "Performs competitor analysis, market research, SWOT, strategic planning, financial analysis, executive reporting, scenario analysis, and product planning.",
    prompt: await buildPromptWithSkills(BUSINESS_ANALYST_PROMPT, AGENT_SKILLS["business-analyst"]),
    tools: [
      ...FILE_CREATION_TOOLS,
      "WebSearch",
      "WebFetch",
    ],
    model: "haiku",
  };

  hrSpecialistAgent = {
    description: "Performs job posting creation, interview questions, performance evaluation, onboarding, organizational design, and change management.",
    prompt: await buildPromptWithSkills(HR_SPECIALIST_PROMPT, AGENT_SKILLS["hr-specialist"]),
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  };

  educationSpecialistAgent = {
    description: "Performs curriculum design, course composition, learning assessment, lecture scripts, textbook planning, AI education design, and education business planning.",
    prompt: await buildPromptWithSkills(EDUCATION_SPECIALIST_PROMPT, AGENT_SKILLS["education-specialist"]),
    tools: [
      ...FILE_CREATION_TOOLS,
      "WebSearch",
      "WebFetch",
    ],
    model: "haiku",
  };

  operationsSupportAgent = {
    description: "Performs project management, legal/compliance, customer service, translation, quality control, and sales support.",
    prompt: await buildPromptWithSkills(OPERATIONS_SUPPORT_PROMPT, AGENT_SKILLS["operations-support"]),
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  };

  // Calculate total unique Skills
  const totalSkills = new Set(
      Object.values(AGENT_SKILLS).flat()
  ).size;
  console.log(`[Agents] All 11 agents initialized (${totalSkills} unique skills loaded)`);
}

// ==============================
// Agent Metadata (for dynamic building)
// ==============================

const AGENT_META: Record<string, {
  description: string;
  prompt: string;
  tools: string[];
  model: string;
}> = {
  "rag-search": {
    description: "Searches indexed documents and generates answers.",
    prompt: RAG_SEARCH_PROMPT,
    tools: ["mcp__rag__search_documents", "mcp__rag__get_document_status", "mcp__rag__list_documents"],
    model: "haiku",
  },
  "web-research": {
    description: "Searches and collects up-to-date information from the web.",
    prompt: WEB_RESEARCH_PROMPT,
    tools: ["WebSearch", "WebFetch", "mcp__fetch__fetch"],
    model: "haiku",
  },
  "file-analyst": {
    description: "Reads and analyzes local files directly.",
    prompt: FILE_ANALYST_PROMPT,
    tools: ["Read", "Glob", "Grep"],
    model: "haiku",
  },
  memory: {
    description: "Tracks and stores user intents and goals.",
    prompt: MEMORY_PROMPT,
    tools: [
      "mcp__rag__save_user_intent", "mcp__rag__get_user_intents",
      "mcp__rag__get_conversation_history", "mcp__rag__log_task_execution",
      "mcp__memory__create_entities", "mcp__memory__create_relations",
      "mcp__memory__add_observations", "mcp__memory__search_nodes", "mcp__memory__read_graph",
    ],
    model: "haiku",
  },
  "doc-writer": {
    description: "Creates documents including reports, proposals, emails, meeting minutes, blogs, essays, and generates DOCX/PDF files.",
    prompt: DOC_WRITER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  },
  "presentation-maker": {
    description: "Creates pitch decks, business report PPTs, educational materials, and creative presentations.",
    prompt: PRESENTATION_MAKER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  },
  "spreadsheet-maker": {
    description: "Creates dashboards, data tables, financial models, and analysis spreadsheets.",
    prompt: SPREADSHEET_MAKER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  },
  "business-analyst": {
    description: "Performs strategy/finance/competitor/market analysis, executive reporting, scenario analysis, and product planning.",
    prompt: BUSINESS_ANALYST_PROMPT,
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "haiku",
  },
  "hr-specialist": {
    description: "Performs recruitment, interviews, evaluation, onboarding, organizational design, and change management.",
    prompt: HR_SPECIALIST_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  },
  "education-specialist": {
    description: "Performs curriculum, course composition, learning assessment, lecture scripts, textbooks, AI education design.",
    prompt: EDUCATION_SPECIALIST_PROMPT,
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "haiku",
  },
  "operations-support": {
    description: "Performs project management, legal, customer service, translation, quality control, and sales support.",
    prompt: OPERATIONS_SUPPORT_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "haiku",
  },
};

/**
 * Dynamically build agents — only load Skills for needed agents
 *
 * @param neededAgents - List of agent names to include Skills for
 * @returns All 11 agents (needed ones include Skills, others use base prompts)
 */
export async function buildAgentsForQuery(
    neededAgents: string[]
): Promise<Record<string, AgentDefinition>> {
  const agents: Record<string, AgentDefinition> = {};
  const needed = new Set(neededAgents);

  for (const [name, meta] of Object.entries(AGENT_META)) {
    const skills = AGENT_SKILLS[name] || [];
    const includeSkills = needed.has(name) && skills.length > 0;

    agents[name] = {
      description: meta.description,
      prompt: includeSkills
          ? await buildPromptWithSkills(meta.prompt, skills)
          : meta.prompt, // Base prompt without Skills
      tools: meta.tools,
      model: meta.model,
    };
  }

  const skillCount = neededAgents.filter((n) => AGENT_SKILLS[n]?.length > 0).length;
  console.log(`[Agents] Dynamic build: ${skillCount}/${Object.keys(AGENT_META).length} agents with skills (${neededAgents.join(", ")})`);

  return agents;
}
// /**
//  * Agent Definitions for Mini-RAG — Multi-Agent Architecture
//  *
//  * 10 specialized agents, each with domain-specific Skills embedded.
//  * Skills are loaded by skill-loader at startup (no settingSources needed).
//  *
//  * Agent Architecture:
//  * - rag-search       : 문서 검색 + 답변
//  * - web-research     : 웹 리서치
//  * - file-analyst     : 파일 분석
//  * - memory           : 의도/기억
//  * - doc-writer       : 문서 작성 (보고서, 이메일, 회의록 등)
//  * - presentation-maker: PPT 생성
//  * - spreadsheet-maker: 엑셀 생성
//  * - business-analyst  : 전략/재무/경쟁사/시장/경영진 보고
//  * - hr-specialist     : 채용/교육/평가/변화관리
//  * - operations-support: PM/법무/CS/번역/품질
//  */
// import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
// import { buildPromptWithSkills } from "./skill-loader.js";
//
// // ==============================
// // 기본 프롬프트 (Skills 주입 전)
// // ==============================
//
// const RAG_SEARCH_PROMPT = `당신은 문서 검색 및 답변 전문가입니다.
//
// ## 작업 절차
// 1. search_documents로 사용자 질문 관련 청크를 검색 (top_k=5)
// 2. 결과 평가:
//    - 충분하면 → 답변 생성
//    - 부족하면 → 키워드 변경 후 재검색 (최대 2회)
//    - 완전히 없으면 → 솔직히 없다고 답변
// 3. 여러 문서에서 정보가 있으면 종합
// 4. 출처 규칙(source-attribution Skill)을 반드시 따르세요
// 5. 검색 전략(search-strategy Skill)을 참고하세요
//
// ## 규칙
// - 검색 결과에 없는 내용은 절대 지어내지 마세요
// - 마크다운 서식 활용 (표, 목록, 코드 블록)
// - **사용자의 언어로 답변하세요.** 사용자가 사용한 언어와 동일한 언어로 답변합니다.`;
//
// const WEB_RESEARCH_PROMPT = `당신은 웹 리서치 전문가입니다.
//
// ## 작업 절차
// 1. WebSearch로 사용자 질문 관련 웹 결과를 검색하세요
// 2. 유용한 결과가 있으면 WebFetch 또는 fetch로 상세 내용을 가져오세요
// 3. 핵심 내용을 요약하여 답변하세요
// 4. 출처 규칙을 따르세요: [제목](URL)
//
// ## 규칙
// - 검색 결과를 있는 그대로 전달하세요 (지어내기 금지)
// - 여러 소스를 비교하여 신뢰성을 높이세요
// - **사용자의 언어로 답변하세요.** 사용자가 사용한 언어와 동일한 언어로 답변합니다.`;
//
// const FILE_ANALYST_PROMPT = `당신은 파일 분석 전문가입니다.
//
// ## 작업 절차
// 1. Glob으로 파일 패턴 검색 또는 Grep으로 내용 검색
// 2. Read로 필요한 파일 내용을 읽으세요
// 3. 분석 결과를 구조화하여 보고하세요
//
// ## 규칙
// - 파일 경로를 정확히 표시하세요
// - 대용량 파일은 관련 부분만 발췌하세요
// - 코드는 언어를 명시한 코드 블록으로 표시`;
//
// const MEMORY_PROMPT = `당신은 사용자 프로파일링 및 지식 관리 전문가입니다.
//
// ## 핵심 역할: 사용자를 기억하고 이해하기
//
// ### 1. 사용자 프로필 자동 감지 및 저장
// 대화에서 다음을 감지하면 **즉시** 지식 그래프에 저장:
// - 이름, 역할, 부서 → Entity "User" + Observations
// - 회사명, 산업, 사업 영역 → Entity "Company" + Observations
// - 업무 선호도 (포맷, 스타일, 언어) → Entity "WorkPattern" + Observations
// - 프로젝트, 마감일, 협업자 → Entity "Project" + Observations
// - 관계: User → works_at → Company, User → prefers → WorkPattern
//
// ### 2. 의도/목표 저장
// - "~하려고 해", "~이 목표야" → save_user_intent (MD 파일)
// - 진행 상태 업데이트 ("다 했어" → status: done)
//
// ### 3. 사용자 컨텍스트 조회
// - 요청 시 search_nodes로 사용자 정보 검색
// - read_graph로 전체 지식 그래프 조회
// - 이전 대화/의도 목록 제공
//
// ### 4. 피드백 기록
// - "좋았어", "다음엔 ~해줘" → add_observations (WorkPattern)
// - 작업 피드백 → add_feedback_to_journal
//
// ## 저장 규칙
// - 민감 정보 (급여, 개인 연락처) 저장 금지
// - "잊어줘", "삭제해줘" → delete_entities/delete_observations
// - 같은 정보 중복 저장 X → 먼저 search_nodes로 확인`;
//
// // ==============================
// // 신규 전문 에이전트 프롬프트
// // ==============================
//
// const DOC_WRITER_PROMPT = `당신은 전문 문서 작성가입니다.
//
// ## 전문 분야
// 보고서, 제안서, 이메일, 회의록, 블로그, 에세이, 기술 문서, 학술 논문
//
// ## 파일 생성 방법: 코드를 직접 작성하고 Bash로 실행
//
// 1. Python 또는 Node.js 스크립트를 Write로 작성
// 2. Bash로 실행 (python script.py 또는 node script.js)
// 3. 출력 파일은 data/output/ 디렉토리에 저장
//
// ### 설치된 라이브러리
// **Python**: python-docx, reportlab, Pillow
// **Node.js**: docx (docx-js)
//
// ## 작업 절차 (순서 중요!)
// 1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
//    - 주제 관련 키워드로 2~3회 검색
//    - 검색 결과의 실제 데이터를 문서에 반영
//    - 검색 결과가 없으면 사용자에게 관련 자료 부족을 알림
// 2. query_work_journal로 이전 유사 작업 기록 확인
// 3. 요청에 맞는 콘텐츠 프레임워크 선택 (아래 Skills 참고)
// 4. 검색된 자료 + 프레임워크로 코드 작성 → Bash 실행
// 5. save_work_journal로 작업 기록
// 6. 파일 경로를 /api/files/파일명 형태로 보고
//
// ⚠️ RAG 검색 없이 일반 지식으로만 문서를 작성하지 마세요. 인덱싱된 자료가 반영되어야 합니다.`;
//
// const PRESENTATION_MAKER_PROMPT = `당신은 전문 프레젠테이션 제작자입니다.
//
// ## 전문 분야
// IR 피치덱, 사업 보고 PPT, 교육 자료, 크리에이티브 프레젠테이션
//
// ## 파일 생성 방법
// 1. Python (python-pptx) 또는 Node.js (pptxgenjs) 스크립트를 Write로 작성
// 2. Bash로 실행
// 3. 출력: data/output/
//
// ### 설치된 라이브러리
// **Python**: python-pptx, Pillow
// **Node.js**: pptxgenjs
//
// ## 작업 절차 (순서 중요!)
// 1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
//    - 주제 관련 키워드로 2~3회 검색하여 실제 데이터 수집
//    - 검색 결과를 PPT 콘텐츠에 반영
// 2. query_work_journal로 이전 PPT 작업 기록 확인
// 3. PPT 유형 결정 (ppt-selector Skill 참고)
// 4. 디자인 규칙 (ppt-design-rules Skill) 적용
// 5. 검색된 자료 + pptx-official Skill 워크플로우로 코드 작성 → 실행
// 6. save_work_journal 기록
// 7. /api/files/파일명 보고
//
// ⚠️ RAG 검색 없이 일반 지식으로만 PPT를 만들지 마세요.`;
//
// const SPREADSHEET_MAKER_PROMPT = `당신은 전문 스프레드시트 제작자입니다.
//
// ## 전문 분야
// 대시보드, 데이터 테이블, 재무 모델, 분석 시트
//
// ## 파일 생성 방법
// 1. Python (openpyxl 또는 xlsxwriter) 스크립트를 Write로 작성
// 2. Bash로 실행
// 3. 출력: data/output/
//
// ### 설치된 라이브러리
// **Python**: openpyxl, xlsxwriter
//
// ## 작업 절차 (순서 중요!)
// 1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
//    - 주제 관련 키워드로 2~3회 검색하여 실제 데이터 수집
//    - 검색 결과를 엑셀 데이터에 반영
// 2. query_work_journal로 이전 엑셀 작업 기록 확인
// 3. 엑셀 유형 결정 (excel-selector Skill 참고)
// 4. 디자인 규칙 (excel-design-rules Skill) 적용
// 5. 검색된 자료 + xlsx-official Skill 워크플로우로 코드 작성 → 실행
// 6. save_work_journal 기록
// 7. /api/files/파일명 보고
//
// ⚠️ RAG 검색 없이 일반 지식으로만 엑셀을 만들지 마세요.`;
//
// const BUSINESS_ANALYST_PROMPT = `당신은 전문 비즈니스 분석가입니다.
//
// ## 전문 분야
// 경쟁사 분석, 시장 조사, SWOT, 전략 기획, 재무 분석,
// 경영진 보고, 이사회 보고, 시나리오 분석, 제품 기획, 로드맵, 매출 분석
//
// ## 작업 절차 (순서 중요!)
// 1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
//    - 분석 주제 관련 키워드로 2~3회 검색
//    - 인덱싱된 내부 자료를 분석의 기초 데이터로 활용
// 2. query_work_journal로 이전 분석 작업 기록 확인
// 3. 분석 프레임워크 선택 (아래 Skills 참고)
// 4. 검색 결과 + WebSearch로 추가 데이터 수집
// 5. 분석 실행 (필요 시 엑셀/PPT는 해당 에이전트에 위임 요청)
// 6. 마크다운으로 분석 결과 보고
// 7. 파일 생성이 필요하면 Python 코드 → Bash 실행
// 8. save_work_journal 기록
//
// ## 규칙
// - 데이터와 사실 기반 분석 (추측 최소화)
// - 숫자에 출처/기준 명시
// - 비교 기준 항상 제시 (전년, 전월, 목표 대비)`;
//
// const HR_SPECIALIST_PROMPT = `당신은 HR/HRD 전문가입니다.
//
// ## 전문 분야
// 채용공고 작성, 면접질문 설계, 성과평가, 교육과정 설계,
// 온보딩, 조직 설계, 변화관리
//
// ## 작업 절차
// 1. query_work_journal로 이전 HR 작업 기록 확인
// 2. HR 프레임워크 선택 (아래 Skills 참고)
// 3. search_documents로 관련 자료 검색
// 4. 결과 마크다운 보고 또는 문서 생성 (Write + Bash)
// 5. save_work_journal 기록
//
// ## 규칙
// - 법적 주의사항 고지 (채용 차별, 개인정보 등)
// - 문화적 맥락 고려 (한국 노동법/관행)
// - 실행 가능한 구체적 산출물 제공`;
//
// const EDUCATION_SPECIALIST_PROMPT = `당신은 교육 전문가 (AIED 특화 + 직무분석/미래일자리)입니다.
//
// ## 전문 분야
// 교육과정 설계 (ADDIE/SAM), 커리큘럼 구성, 학습 평가 설계,
// 인강/영상 스크립트, 교재/도서 기획, AI 교육 설계,
// 교육 콘텐츠 제작, 교육 사업 기획,
// **교육 이력 기반 직무 역량 분석, 스킬 갭 분석, 미래 일자리 추천**
//
// ## 작업 절차 (순서 중요!)
// 1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
//    - 교육 이력, 자격증, 경력 데이터 검색
//    - 엑셀 데이터가 있으면 해당 사람의 정보를 정확히 추출
// 2. query_work_journal로 이전 교육 작업 기록 확인
// 3. 교육/분석 프레임워크 선택 (아래 Skills 참고)
// 4. 설계/기획/분석 결과를 마크다운 또는 문서로 제작
// 5. 파일 생성이 필요하면 Python 코드 → Bash 실행
// 6. save_work_journal 기록
//
// ## 직무 분석 파이프라인
// 교육 이력 → 직무 분석 → 교육 설계 → 미래 일자리 요청 시:
// 1. **역량 추출**: 교육/자격/경력 데이터에서 보유 역량과 수준 추출 (career-pathway-analyzer)
// 2. **갭 분석**: 목표 직무와의 역량 차이 산출 (skills-gap-analyzer)
// 3. **교육 설계**: 갭 기반 맞춤 교육 과정 설계 (course-design, curriculum-builder)
// 4. **미래 일자리**: 보유 역량 + 시장 트렌드 기반 추천 (future-job-recommender)
//
// ## 규칙
// - 학습목표는 반드시 관찰 가능한 동사 사용 (Bloom's Taxonomy)
// - 평가는 학습목표와 정렬 (Alignment)
// - 학습자 중심 설계 (교수자 중심 X)
// - AI 교육 설계 시 윤리/개인정보 고려
// - **사용자의 언어로 답변하세요.** 사용자가 사용한 언어와 동일한 언어로 답변합니다.`;
//
// const OPERATIONS_SUPPORT_PROMPT = `당신은 운영/지원 업무 전문가입니다.
//
// ## 전문 분야
// 프로젝트 관리 (WBS, 리스크), 법무/컴플라이언스,
// 고객 서비스 (FAQ, 응답), 번역/다국어, 품질관리/감사
//
// ## 작업 절차
// 1. query_work_journal로 이전 작업 기록 확인
// 2. 도메인별 프레임워크 선택 (아래 Skills 참고)
// 3. search_documents로 관련 자료 검색
// 4. 결과 마크다운 보고 또는 문서 생성 (Write + Bash)
// 5. save_work_journal 기록
//
// ## 규칙
// - 법무 관련: 법적 조언이 아닌 템플릿/체크리스트 제공 명시
// - 번역: 전문 용어 일관성 유지, 원어 병기
// - PM: 실행 가능한 WBS/타임라인 제공`;
//
// // ==============================
// // 에이전트별 Skills 매핑
// // ==============================
//
// const AGENT_SKILLS: Record<string, string[]> = {
//   "rag-search": ["source-attribution", "search-strategy"],
//   "web-research": ["source-attribution"],
//   "file-analyst": [],
//   memory: ["intent-tracking", "user-profiling"],
//
//   // 문서 작성 에이전트
//   "doc-writer": [
//     "docx-official",
//     "pdf-official",
//     "writing-selector",
//     "pyramid-scqa",
//     "problem-solution-benefit",
//     "spin-framework",
//     "amazon-prfaq",
//     "bluf-writing",
//     "executive-summary",
//     "star-framework",
//     "technical-document",
//     "imrad-academic",
//     "email-professional",
//     "meeting-minutes",
//     "blog-seo",
//     "narrative-essay",
//     "three-act-story",
//     "aida-marketing",
//     "pas-copywriting",
//     "storybrand",
//     "show-dont-tell",
//     "work-journal",
//   ],
//
//   // PPT 에이전트
//   "presentation-maker": [
//     "pptx-official",
//     "ppt-selector",
//     "pitch-deck",
//     "status-report-ppt",
//     "training-slides",
//     "creative-presentation",
//     "ppt-design-rules",
//     "work-journal",
//   ],
//
//   // 엑셀 에이전트
//   "spreadsheet-maker": [
//     "xlsx-official",
//     "excel-selector",
//     "excel-dashboard",
//     "excel-data-table",
//     "excel-design-rules",
//     "work-journal",
//   ],
//
//   // 비즈니스 분석 에이전트
//   "business-analyst": [
//     "competitor-analysis",
//     "strategic-planning",
//     "financial-report",
//     "data-analysis",
//     "executive-briefing",
//     "board-report",
//     "scenario-analysis",
//     "product-planning",
//     "roadmap-builder",
//     "revenue-analysis",
//     "work-journal",
//   ],
//
//   // HR 전문 에이전트
//   "hr-specialist": [
//     "hr-recruitment",
//     "change-management",
//     "org-design",
//     "work-journal",
//   ],
//
//   // 교육 전문 에이전트 (AIED 특화 + 직무분석/미래일자리)
//   "education-specialist": [
//     "course-design",
//     "learning-assessment",
//     "curriculum-builder",
//     "lecture-script",
//     "textbook-planning",
//     "ai-education-design",
//     "education-business",
//     "education-content",
//     "hrd-training",
//     "training-slides",
//     "career-pathway-analyzer",
//     "skills-gap-analyzer",
//     "future-job-recommender",
//     "work-journal",
//   ],
//
//   // 운영/지원 에이전트
//   "operations-support": [
//     "project-management",
//     "legal-compliance",
//     "customer-service",
//     "customer-success",
//     "translation-guide",
//     "quality-management",
//     "compliance-audit",
//     "sales-outreach",
//     "work-journal",
//   ],
// };
//
// // ==============================
// // 공통 도구 세트
// // ==============================
//
// const FILE_CREATION_TOOLS = [
//   "Bash",
//   "Write",
//   "Read",
//   "Glob",
//   "mcp__rag__search_documents",
//   "mcp__rag__query_work_journal",
//   "mcp__rag__save_work_journal",
//   "mcp__rag__add_feedback_to_journal",
//   "mcp__rag__log_task_execution",
// ];
//
// // ==============================
// // 초기화된 에이전트 (Skills 주입 완료)
// // ==============================
//
// export let ragSearchAgent: AgentDefinition;
// export let webResearchAgent: AgentDefinition;
// export let fileAnalystAgent: AgentDefinition;
// export let memoryAgent: AgentDefinition;
// export let docWriterAgent: AgentDefinition;
// export let presentationMakerAgent: AgentDefinition;
// export let spreadsheetMakerAgent: AgentDefinition;
// export let businessAnalystAgent: AgentDefinition;
// export let hrSpecialistAgent: AgentDefinition;
// export let educationSpecialistAgent: AgentDefinition;
// export let operationsSupportAgent: AgentDefinition;
//
// /**
//  * 서버 시작 시 호출 — 모든 에이전트 프롬프트에 Skills 내용을 주입
//  */
// export async function initAgents(): Promise<void> {
//   console.log("[Agents] Loading skills into 10 agent prompts...");
//
//   ragSearchAgent = {
//     description: "인덱싱된 문서에서 검색하여 답변을 생성합니다.",
//     prompt: await buildPromptWithSkills(RAG_SEARCH_PROMPT, AGENT_SKILLS["rag-search"]),
//     tools: [
//       "mcp__rag__search_documents",
//       "mcp__rag__get_document_status",
//       "mcp__rag__list_documents",
//     ],
//     model: "haiku",
//   };
//
//   webResearchAgent = {
//     description: "웹에서 최신 정보를 검색하고 수집합니다.",
//     prompt: await buildPromptWithSkills(WEB_RESEARCH_PROMPT, AGENT_SKILLS["web-research"]),
//     tools: ["WebSearch", "WebFetch", "mcp__fetch__fetch"],
//     model: "haiku",
//   };
//
//   fileAnalystAgent = {
//     description: "로컬 파일을 직접 읽고 분석합니다.",
//     prompt: FILE_ANALYST_PROMPT,
//     tools: ["Read", "Glob", "Grep"],
//     model: "haiku",
//   };
//
//   memoryAgent = {
//     description: "사용자의 의도와 목표를 추적하고 저장합니다.",
//     prompt: await buildPromptWithSkills(MEMORY_PROMPT, AGENT_SKILLS["memory"]),
//     tools: [
//       "mcp__rag__save_user_intent",
//       "mcp__rag__get_user_intents",
//       "mcp__rag__get_conversation_history",
//       "mcp__rag__log_task_execution",
//       "mcp__memory__create_entities",
//       "mcp__memory__create_relations",
//       "mcp__memory__add_observations",
//       "mcp__memory__search_nodes",
//       "mcp__memory__read_graph",
//     ],
//     model: "haiku",
//   };
//
//   // ==============================
//   // 전문 도메인 에이전트들
//   // ==============================
//
//   docWriterAgent = {
//     description: "보고서, 제안서, 이메일, 회의록, 블로그, 에세이 등 다양한 문서를 작성하고 DOCX/PDF를 생성합니다.",
//     prompt: await buildPromptWithSkills(DOC_WRITER_PROMPT, AGENT_SKILLS["doc-writer"]),
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   };
//
//   presentationMakerAgent = {
//     description: "피치덱, 보고 PPT, 교육 자료, 크리에이티브 프레젠테이션을 제작합니다.",
//     prompt: await buildPromptWithSkills(PRESENTATION_MAKER_PROMPT, AGENT_SKILLS["presentation-maker"]),
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   };
//
//   spreadsheetMakerAgent = {
//     description: "대시보드, 데이터 테이블, 재무 모델, 분석 시트 엑셀을 제작합니다.",
//     prompt: await buildPromptWithSkills(SPREADSHEET_MAKER_PROMPT, AGENT_SKILLS["spreadsheet-maker"]),
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   };
//
//   businessAnalystAgent = {
//     description: "경쟁사 분석, 시장조사, SWOT, 전략 기획, 재무 분석, 경영진 보고, 시나리오 분석, 제품 기획을 수행합니다.",
//     prompt: await buildPromptWithSkills(BUSINESS_ANALYST_PROMPT, AGENT_SKILLS["business-analyst"]),
//     tools: [
//       ...FILE_CREATION_TOOLS,
//       "WebSearch",
//       "WebFetch",
//     ],
//     model: "haiku",
//   };
//
//   hrSpecialistAgent = {
//     description: "채용공고, 면접질문, 성과평가, 온보딩, 조직 설계, 변화관리를 수행합니다.",
//     prompt: await buildPromptWithSkills(HR_SPECIALIST_PROMPT, AGENT_SKILLS["hr-specialist"]),
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   };
//
//   educationSpecialistAgent = {
//     description: "교육과정 설계, 커리큘럼, 학습 평가, 인강 스크립트, 교재 기획, AI 교육 설계, 교육 사업 기획을 수행합니다.",
//     prompt: await buildPromptWithSkills(EDUCATION_SPECIALIST_PROMPT, AGENT_SKILLS["education-specialist"]),
//     tools: [
//       ...FILE_CREATION_TOOLS,
//       "WebSearch",
//       "WebFetch",
//     ],
//     model: "haiku",
//   };
//
//   operationsSupportAgent = {
//     description: "프로젝트 관리, 법무/컴플라이언스, 고객서비스, 번역, 품질관리, 영업지원을 수행합니다.",
//     prompt: await buildPromptWithSkills(OPERATIONS_SUPPORT_PROMPT, AGENT_SKILLS["operations-support"]),
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   };
//
//   // 총 Skills 수 계산
//   const totalSkills = new Set(
//     Object.values(AGENT_SKILLS).flat()
//   ).size;
//   console.log(`[Agents] All 11 agents initialized (${totalSkills} unique skills loaded)`);
// }
//
// // ==============================
// // 에이전트 메타데이터 (동적 빌드용)
// // ==============================
//
// const AGENT_META: Record<string, {
//   description: string;
//   prompt: string;
//   tools: string[];
//   model: string;
// }> = {
//   "rag-search": {
//     description: "인덱싱된 문서에서 검색하여 답변을 생성합니다.",
//     prompt: RAG_SEARCH_PROMPT,
//     tools: ["mcp__rag__search_documents", "mcp__rag__get_document_status", "mcp__rag__list_documents"],
//     model: "haiku",
//   },
//   "web-research": {
//     description: "웹에서 최신 정보를 검색하고 수집합니다.",
//     prompt: WEB_RESEARCH_PROMPT,
//     tools: ["WebSearch", "WebFetch", "mcp__fetch__fetch"],
//     model: "haiku",
//   },
//   "file-analyst": {
//     description: "로컬 파일을 직접 읽고 분석합니다.",
//     prompt: FILE_ANALYST_PROMPT,
//     tools: ["Read", "Glob", "Grep"],
//     model: "haiku",
//   },
//   memory: {
//     description: "사용자의 의도와 목표를 추적하고 저장합니다.",
//     prompt: MEMORY_PROMPT,
//     tools: [
//       "mcp__rag__save_user_intent", "mcp__rag__get_user_intents",
//       "mcp__rag__get_conversation_history", "mcp__rag__log_task_execution",
//       "mcp__memory__create_entities", "mcp__memory__create_relations",
//       "mcp__memory__add_observations", "mcp__memory__search_nodes", "mcp__memory__read_graph",
//     ],
//     model: "haiku",
//   },
//   "doc-writer": {
//     description: "보고서, 제안서, 이메일, 회의록, 블로그, 에세이 등 DOCX/PDF를 생성합니다.",
//     prompt: DOC_WRITER_PROMPT,
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   },
//   "presentation-maker": {
//     description: "피치덱, 보고 PPT, 교육 자료, 크리에이티브 프레젠테이션을 제작합니다.",
//     prompt: PRESENTATION_MAKER_PROMPT,
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   },
//   "spreadsheet-maker": {
//     description: "대시보드, 데이터 테이블, 재무 모델 엑셀을 제작합니다.",
//     prompt: SPREADSHEET_MAKER_PROMPT,
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   },
//   "business-analyst": {
//     description: "전략/재무/경쟁사/시장 분석, 경영진 보고, 시나리오, 제품 기획을 수행합니다.",
//     prompt: BUSINESS_ANALYST_PROMPT,
//     tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
//     model: "haiku",
//   },
//   "hr-specialist": {
//     description: "채용, 면접, 평가, 온보딩, 조직 설계, 변화관리를 수행합니다.",
//     prompt: HR_SPECIALIST_PROMPT,
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   },
//   "education-specialist": {
//     description: "교육과정, 커리큘럼, 학습 평가, 인강, 교재, AI 교육 설계를 수행합니다.",
//     prompt: EDUCATION_SPECIALIST_PROMPT,
//     tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
//     model: "haiku",
//   },
//   "operations-support": {
//     description: "프로젝트 관리, 법무, 고객서비스, 번역, 품질관리, 영업지원을 수행합니다.",
//     prompt: OPERATIONS_SUPPORT_PROMPT,
//     tools: FILE_CREATION_TOOLS,
//     model: "haiku",
//   },
// };
//
// /**
//  * 동적 에이전트 빌드 — 필요한 에이전트만 Skills 로드
//  *
//  * @param neededAgents - Skills를 포함할 에이전트 이름 목록
//  * @returns 모든 11개 에이전트 (needed만 Skills 포함, 나머지는 기본 프롬프트)
//  */
// export async function buildAgentsForQuery(
//   neededAgents: string[]
// ): Promise<Record<string, AgentDefinition>> {
//   const agents: Record<string, AgentDefinition> = {};
//   const needed = new Set(neededAgents);
//
//   for (const [name, meta] of Object.entries(AGENT_META)) {
//     const skills = AGENT_SKILLS[name] || [];
//     const includeSkills = needed.has(name) && skills.length > 0;
//
//     agents[name] = {
//       description: meta.description,
//       prompt: includeSkills
//         ? await buildPromptWithSkills(meta.prompt, skills)
//         : meta.prompt, // Skills 없이 기본 프롬프트만
//       tools: meta.tools,
//       model: meta.model,
//     };
//   }
//
//   const skillCount = neededAgents.filter((n) => AGENT_SKILLS[n]?.length > 0).length;
//   console.log(`[Agents] Dynamic build: ${skillCount}/${Object.keys(AGENT_META).length} agents with skills (${neededAgents.join(", ")})`);
//
//   return agents;
// }
