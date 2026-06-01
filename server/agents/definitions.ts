/**
 * Agent Definitions for Mini-RAG — DeepSeek V4 Flash 마이그레이션 버전
 *
 * @anthropic-ai/claude-agent-sdk의 AgentDefinition 제거
 * → LangGraph createReactAgent 기반 AgentSpec으로 교체
 *
 * 11개 전문 에이전트, 각자 도메인 Skills 임베딩.
 */
import { buildPromptWithSkills } from "./skill-loader.js";

// ==============================
// AgentSpec 타입 정의 (AgentDefinition 대체)
// ==============================

export interface AgentSpec {
  name: string;
  description: string;
  prompt: string;
  tools: string[];   // 허용 도구 이름 목록 (필터링용)
  model: string;     // "deepseek-v4-flash"
}

// ==============================
// 기본 프롬프트 (Skills 주입 전)
// ==============================

const RAG_SEARCH_PROMPT = `당신은 문서 검색 및 답변 전문가입니다.

## 작업 절차
1. search_documents로 사용자 질문 관련 청크를 검색 (top_k=5)
2. 결과 평가:
   - 충분하면 → 답변 생성
   - 부족하면 → 키워드 변경 후 재검색 (최대 2회)
   - 완전히 없으면 → 솔직히 없다고 답변
3. 여러 문서에서 정보가 있으면 종합
4. 출처 규칙(source-attribution Skill)을 반드시 따르세요
5. 검색 전략(search-strategy Skill)을 참고하세요

## 규칙
- 검색 결과에 없는 내용은 절대 지어내지 마세요
- 마크다운 서식 활용 (표, 목록, 코드 블록)
- **사용자의 언어로 답변하세요.**`;

const WEB_RESEARCH_PROMPT = `당신은 웹 리서치 전문가입니다.

## 작업 절차
1. WebSearch로 사용자 질문 관련 웹 결과를 검색하세요
2. 유용한 결과가 있으면 WebFetch로 상세 내용을 가져오세요
3. 핵심 내용을 요약하여 답변하세요
4. 출처 규칙을 따르세요: [제목](URL)

## 규칙
- 검색 결과를 있는 그대로 전달하세요 (지어내기 금지)
- **사용자의 언어로 답변하세요.**`;

const FILE_ANALYST_PROMPT = `당신은 파일 분석 전문가입니다.

## 작업 절차
1. Glob으로 파일 패턴 검색 또는 Grep으로 내용 검색
2. Read로 필요한 파일 내용을 읽으세요
3. 분석 결과를 구조화하여 보고하세요

## 규칙
- 파일 경로를 정확히 표시하세요
- 대용량 파일은 관련 부분만 발췌하세요
- 코드는 언어를 명시한 코드 블록으로 표시`;

const MEMORY_PROMPT = `당신은 사용자 프로파일링 및 지식 관리 전문가입니다.

## 핵심 역할: 사용자를 기억하고 이해하기

### 1. 사용자 프로필 자동 감지 및 저장
대화에서 다음을 감지하면 **즉시** 저장:
- 이름, 역할, 부서 → Entity "User"
- 회사명, 산업 → Entity "Company"
- 업무 선호도 → Entity "WorkPattern"

### 2. 의도/목표 저장
- "~하려고 해" → save_user_intent
- 진행 상태 업데이트

### 3. 피드백 기록
- "좋았어", "다음엔 ~해줘" → add_feedback_to_journal

## 저장 규칙
- 민감 정보 저장 금지
- 중복 저장 방지 — 먼저 조회 후 저장`;

const DOC_WRITER_PROMPT = `당신은 전문 문서 작성가입니다.

## 전문 분야
보고서, 제안서, 이메일, 회의록, 블로그, 에세이, 기술 문서

## 작업 절차 (순서 중요!)
1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
2. query_work_journal로 이전 유사 작업 기록 확인
3. 요청에 맞는 콘텐츠 프레임워크 선택
4. **create_docx 도구를 직접 호출하여 Word 파일 생성** (Bash 사용 금지!)
5. save_work_journal로 작업 기록
6. 파일 경로(/api/files/파일명)를 응답에 반드시 포함

⚠️ create_docx 도구를 반드시 호출하세요. "만들었습니다"고만 말하고 도구 호출을 생략하면 안 됩니다.
⚠️ RAG 검색 없이 일반 지식으로만 문서를 작성하지 마세요.`;

const PRESENTATION_MAKER_PROMPT = `당신은 전문 프레젠테이션 제작자입니다.

## 전문 분야
IR 피치덱, 사업 보고 PPT, 교육 자료

## 작업 절차 (순서 중요!)
1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
2. query_work_journal로 이전 PPT 작업 기록 확인
3. PPT 유형 결정
4. **create_pptx 도구를 직접 호출하여 PowerPoint 파일 생성** (Bash 사용 금지!)
5. save_work_journal 기록
6. 파일 경로(/api/files/파일명)를 응답에 반드시 포함

⚠️ create_pptx 도구를 반드시 호출하세요. 도구 호출 없이 "만들었습니다"고만 말하면 안 됩니다.`;

const SPREADSHEET_MAKER_PROMPT = `당신은 전문 스프레드시트 제작자입니다.

## 전문 분야
대시보드, 데이터 테이블, 재무 모델

## 작업 절차 (순서 중요!)
1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
2. query_work_journal로 이전 엑셀 작업 기록 확인
3. 엑셀 유형 결정
4. **create_excel 도구를 직접 호출하여 Excel 파일 생성** (Bash 사용 금지!)
5. save_work_journal 기록
6. 파일 경로(/api/files/파일명)를 응답에 반드시 포함

⚠️ create_excel 도구를 반드시 호출하세요. 도구 호출 없이 "만들었습니다"고만 말하면 안 됩니다.`;

const BUSINESS_ANALYST_PROMPT = `당신은 전문 비즈니스 분석가입니다.

## 전문 분야
경쟁사 분석, 시장 조사, SWOT, 전략 기획, 재무 분석,
경영진 보고, 시나리오 분석, 제품 기획, 로드맵

## 작업 절차 (순서 중요!)
1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
2. query_work_journal로 이전 분석 작업 기록 확인
3. 분석 프레임워크 선택
4. 분석 실행
5. save_work_journal 기록`;

const HR_SPECIALIST_PROMPT = `당신은 HR/HRD 전문가입니다.

## 전문 분야
채용공고 작성, 면접질문 설계, 성과평가, 교육과정 설계,
온보딩, 조직 설계, 변화관리

## 작업 절차
1. query_work_journal로 이전 HR 작업 기록 확인
2. HR 프레임워크 선택
3. search_documents로 관련 자료 검색
4. 결과 마크다운 보고 또는 문서 생성
5. save_work_journal 기록`;

const EDUCATION_SPECIALIST_PROMPT = `당신은 교육 전문가 (AIED 특화 + 직무분석/미래일자리)입니다.

## 전문 분야
교육과정 설계 (ADDIE/SAM), 커리큘럼 구성, 학습 평가 설계,
인강/영상 스크립트, 교재/도서 기획, AI 교육 설계,
교육 콘텐츠 제작, 교육 사업 기획,
**교육 이력 기반 직무 역량 분석, 스킬 갭 분석, 미래 일자리 추천**

## 작업 절차 (순서 중요!)
1. **search_documents로 RAG 검색 — 반드시 먼저 실행!**
2. query_work_journal로 이전 교육 작업 기록 확인
3. 교육/분석 프레임워크 선택
4. 설계/기획/분석 결과를 마크다운 또는 문서로 제작
5. save_work_journal 기록

## 규칙
- 학습목표는 반드시 관찰 가능한 동사 사용 (Bloom's Taxonomy)
- **사용자의 언어로 답변하세요.**`;

const OPERATIONS_SUPPORT_PROMPT = `당신은 운영/지원 업무 전문가입니다.

## 전문 분야
프로젝트 관리 (WBS, 리스크), 법무/컴플라이언스,
고객 서비스 (FAQ, 응답), 번역/다국어, 품질관리/감사

## 작업 절차
1. query_work_journal로 이전 작업 기록 확인
2. 도메인별 프레임워크 선택
3. search_documents로 관련 자료 검색
4. 결과 마크다운 보고 또는 문서 생성
5. save_work_journal 기록`;

// ==============================
// 에이전트별 Skills 매핑
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
// 공통 도구 세트
// ==============================

const FILE_CREATION_TOOLS = [
  "Bash", "Write", "Read", "Glob",
  "search_documents", "query_work_journal", "save_work_journal",
  "add_feedback_to_journal", "log_task_execution",
  "create_docx", "create_pptx", "create_excel",
];

// ==============================
// 에이전트 메타데이터
// ==============================

const AGENT_META: Record<string, {
  description: string;
  prompt: string;
  tools: string[];
  model: string;
}> = {
  "rag-search": {
    description: "인덱싱된 문서에서 검색하여 답변을 생성합니다.",
    prompt: RAG_SEARCH_PROMPT,
    tools: ["search_documents", "get_document_status", "list_documents"],
    model: "deepseek-v4-flash",
  },
  "web-research": {
    description: "웹에서 최신 정보를 검색하고 수집합니다.",
    prompt: WEB_RESEARCH_PROMPT,
    tools: ["WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  },
  "file-analyst": {
    description: "로컬 파일을 직접 읽고 분석합니다.",
    prompt: FILE_ANALYST_PROMPT,
    tools: ["Read", "Glob", "Grep"],
    model: "deepseek-v4-flash",
  },
  memory: {
    description: "사용자의 의도와 목표를 추적하고 저장합니다.",
    prompt: MEMORY_PROMPT,
    tools: [
      "save_user_intent", "get_user_intents",
      "get_conversation_history", "log_task_execution",
    ],
    model: "deepseek-v4-flash",
  },
  "doc-writer": {
    description: "보고서, 제안서, 이메일, 회의록, 블로그, 에세이 등 DOCX/PDF를 생성합니다.",
    prompt: DOC_WRITER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "presentation-maker": {
    description: "피치덱, 보고 PPT, 교육 자료, 프레젠테이션을 제작합니다.",
    prompt: PRESENTATION_MAKER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "spreadsheet-maker": {
    description: "대시보드, 데이터 테이블, 재무 모델 엑셀을 제작합니다.",
    prompt: SPREADSHEET_MAKER_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "business-analyst": {
    description: "전략/재무/경쟁사/시장 분석, 경영진 보고, 시나리오, 제품 기획을 수행합니다.",
    prompt: BUSINESS_ANALYST_PROMPT,
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  },
  "hr-specialist": {
    description: "채용, 면접, 평가, 온보딩, 조직 설계, 변화관리를 수행합니다.",
    prompt: HR_SPECIALIST_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
  "education-specialist": {
    description: "교육과정, 커리큘럼, 학습 평가, 인강, 교재, AI 교육 설계를 수행합니다.",
    prompt: EDUCATION_SPECIALIST_PROMPT,
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  },
  "operations-support": {
    description: "프로젝트 관리, 법무, 고객서비스, 번역, 품질관리, 영업지원을 수행합니다.",
    prompt: OPERATIONS_SUPPORT_PROMPT,
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  },
};

// ==============================
// 초기화된 에이전트 (하위 호환성)
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
 * 서버 시작 시 호출 — 모든 에이전트 프롬프트에 Skills 내용을 주입
 */
export async function initAgents(): Promise<void> {
  console.log("[Agents] Loading skills into 11 agent prompts (DeepSeek V4 Flash)...");

  ragSearchAgent = {
    name: "rag-search",
    description: "인덱싱된 문서에서 검색하여 답변을 생성합니다.",
    prompt: await buildPromptWithSkills(RAG_SEARCH_PROMPT, AGENT_SKILLS["rag-search"]),
    tools: AGENT_META["rag-search"].tools,
    model: "deepseek-v4-flash",
  };

  webResearchAgent = {
    name: "web-research",
    description: "웹에서 최신 정보를 검색하고 수집합니다.",
    prompt: await buildPromptWithSkills(WEB_RESEARCH_PROMPT, AGENT_SKILLS["web-research"]),
    tools: AGENT_META["web-research"].tools,
    model: "deepseek-v4-flash",
  };

  fileAnalystAgent = {
    name: "file-analyst",
    description: "로컬 파일을 직접 읽고 분석합니다.",
    prompt: FILE_ANALYST_PROMPT,
    tools: AGENT_META["file-analyst"].tools,
    model: "deepseek-v4-flash",
  };

  memoryAgent = {
    name: "memory",
    description: "사용자의 의도와 목표를 추적하고 저장합니다.",
    prompt: await buildPromptWithSkills(MEMORY_PROMPT, AGENT_SKILLS["memory"]),
    tools: AGENT_META["memory"].tools,
    model: "deepseek-v4-flash",
  };

  docWriterAgent = {
    name: "doc-writer",
    description: "보고서, 제안서, 이메일, 회의록, 블로그, 에세이 등 다양한 문서를 작성하고 DOCX/PDF를 생성합니다.",
    prompt: await buildPromptWithSkills(DOC_WRITER_PROMPT, AGENT_SKILLS["doc-writer"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  presentationMakerAgent = {
    name: "presentation-maker",
    description: "피치덱, 보고 PPT, 교육 자료, 크리에이티브 프레젠테이션을 제작합니다.",
    prompt: await buildPromptWithSkills(PRESENTATION_MAKER_PROMPT, AGENT_SKILLS["presentation-maker"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  spreadsheetMakerAgent = {
    name: "spreadsheet-maker",
    description: "대시보드, 데이터 테이블, 재무 모델, 분석 시트 엑셀을 제작합니다.",
    prompt: await buildPromptWithSkills(SPREADSHEET_MAKER_PROMPT, AGENT_SKILLS["spreadsheet-maker"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  businessAnalystAgent = {
    name: "business-analyst",
    description: "경쟁사 분석, 시장조사, SWOT, 전략 기획, 재무 분석, 경영진 보고, 시나리오 분석, 제품 기획을 수행합니다.",
    prompt: await buildPromptWithSkills(BUSINESS_ANALYST_PROMPT, AGENT_SKILLS["business-analyst"]),
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  };

  hrSpecialistAgent = {
    name: "hr-specialist",
    description: "채용공고, 면접질문, 성과평가, 온보딩, 조직 설계, 변화관리를 수행합니다.",
    prompt: await buildPromptWithSkills(HR_SPECIALIST_PROMPT, AGENT_SKILLS["hr-specialist"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  educationSpecialistAgent = {
    name: "education-specialist",
    description: "교육과정 설계, 커리큘럼, 학습 평가, 인강 스크립트, 교재 기획, AI 교육 설계, 교육 사업 기획을 수행합니다.",
    prompt: await buildPromptWithSkills(EDUCATION_SPECIALIST_PROMPT, AGENT_SKILLS["education-specialist"]),
    tools: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
    model: "deepseek-v4-flash",
  };

  operationsSupportAgent = {
    name: "operations-support",
    description: "프로젝트 관리, 법무/컴플라이언스, 고객서비스, 번역, 품질관리, 영업지원을 수행합니다.",
    prompt: await buildPromptWithSkills(OPERATIONS_SUPPORT_PROMPT, AGENT_SKILLS["operations-support"]),
    tools: FILE_CREATION_TOOLS,
    model: "deepseek-v4-flash",
  };

  const totalSkills = new Set(Object.values(AGENT_SKILLS).flat()).size;
  console.log(`[Agents] All 11 agents initialized (${totalSkills} unique skills loaded) — DeepSeek V4 Flash`);
}

/**
 * 동적 에이전트 빌드 — 필요한 에이전트만 Skills 로드
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
