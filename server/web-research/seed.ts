/**
 * Seed initial research topics if none exist
 *
 * Called on every server start — safe to re-run (only seeds when table is empty).
 */
import { listTopics, addTopic } from "./topics.js";
import { scheduleTopic } from "./scheduler.js";

/**
 * Sri Lanka TVET Career Counseling Research Topics
 *
 * Collected for vocational training institution students to receive
 * practical, real-world career guidance through the Mini-RAG widget.
 *
 * Categories:
 * 1. Official TVET institutions & qualification frameworks (NVQ, TVEC, NAVTA)
 * 2. Industry-specific career paths (tourism, IT, manufacturing, agriculture, textiles)
 * 3. Employability skills & job market information
 * 4. Self-employment & entrepreneurship pathways
 * 5. Further education & skills certification pathways
 */
const INITIAL_TOPICS: Array<{
  name: string;
  query: string;
  url_list: string[] | null;
  source_type: "keyword" | "url";
  interval_minutes: number;
}> = [
  // ── Official TVET Portals (URL-based — reliable Wikipedia content) ──
  {
    name: "스리랑카 NVQ 자격체계 (TVEC)",
    query: "",
    url_list: [
      "https://en.wikipedia.org/wiki/Vocational_education_in_Sri_Lanka",
      "https://en.wikipedia.org/wiki/Technical_and_Vocational_Education_and_Training",
      "https://en.wikipedia.org/wiki/TVET_in_Sri_Lanka",
    ],
    source_type: "url",
    interval_minutes: 720,
  },
  {
    name: "스리랑카 직업훈련청 (NAVTA)",
    query: "",
    url_list: [
      "https://en.wikipedia.org/wiki/National_Vocational_Qualifications",
      "https://en.wikipedia.org/wiki/Education_in_Sri_Lanka",
    ],
    source_type: "url",
    interval_minutes: 720,
  },
  {
    name: "스리랑카 교육제도&취업력",
    query: "",
    url_list: [
      "https://en.wikipedia.org/wiki/Education_in_Sri_Lanka",
      "https://en.wikipedia.org/wiki/Sri_Lanka_economy",
      "https://en.wikipedia.org/wiki/Tourism_in_Sri_Lanka",
    ],
    source_type: "url",
    interval_minutes: 720,
  },

  // ── Industry Career Paths (keyword-based — Wikipedia search) ──
  // Tourism & Hospitality (major employer in Sri Lanka)
  {
    name: "스리랑카 관광호텔 관광산업 취업진로",
    query: "Tourism in Sri Lanka",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 360,
  },
  // ICT & Technology careers
  {
    name: "스리랑카 IT정보기술 직업훈련 취업",
    query: "Information technology in Sri Lanka",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 360,
  },
  // Manufacturing & Industrial skills
  {
    name: "스리랑카 제조업 산업职业技能 훈련",
    query: "Manufacturing in Sri Lanka",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 360,
  },
  // Agriculture & Agribusiness (still significant employer)
  {
    name: "스리랑카 농업 직업훈련 취업진로",
    query: "Agriculture in Sri Lanka",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 720,
  },
  // Textiles & Garment industry (major export industry)
  {
    name: "스리랑카 섬유산업 수출职业技能",
    query: "Textile industry in Sri Lanka",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 720,
  },
  // Entrepreneurship & Self-employment
  {
    name: "스리랑카 자영업 창업 기업가정신",
    query: "Small business in Sri Lanka",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 720,
  },
  // Employability skills & job search
  {
    name: "스리랑카 employability职业技能 취업능력",
    query: "Employability, Skills & Lifelong Learning",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 360,
  },
  // Further education pathways (NVQ to degree)
  {
    name: "스리랑카 NVQ 자격에서 학위로 진학",
    query: "Vocational education in Sri Lanka",
    url_list: null,
    source_type: "keyword",
    interval_minutes: 720,
  },
];

export function seedInitialTopics(): void {
  const existing = listTopics();
  if (existing.length > 0) {
    console.log(`[Scheduler] ${existing.length} research topics already exist — skipping seed`);
    return;
  }

  console.log(`[Scheduler] Seeding ${INITIAL_TOPICS.length} initial research topics...`);
  for (const t of INITIAL_TOPICS) {
    const id = addTopic(t.name, t.query, t.url_list, t.source_type, t.interval_minutes);
    scheduleTopic(id, t.interval_minutes);
    console.log(`[Scheduler] Seeded topic: ${t.name} (${t.source_type}, ${t.interval_minutes}min)`);
  }
}
