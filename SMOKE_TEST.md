# Mini-RAG DeepSeek V4 Flash — 스모크 테스트 체크리스트

> **목적**: 마이그레이션 후 모든 핵심 기능이 정상 동작하는지 최소 검증  
> **환경**: `DEEPSEEK_API_KEY` 설정 완료, 서버 기동 완료 (`npm run dev`)  
> **기준**: `curl` 명령 전부 `localhost:4001` 기준

---

## ✅ 사전 준비

```bash
# 서버 기동
npm run dev

# .env 확인
cat .env | grep DEEPSEEK_API_KEY
```

---

## 1. 서버 기동 검증

### 1-1. Health Check
```bash
curl -s http://localhost:4001/api/health
```
**예상**: `{"status":"ok","timestamp":"..."}`

### 1-2. 인덱스 상태 조회
```bash
curl -s http://localhost:4001/api/status
```
**예상**: `{"total_documents":N,"total_chunks":N,"by_format":[...],"usage":{...}}`

### 1-3. 문서 목록 조회
```bash
curl -s http://localhost:4001/api/documents
```
**예상**: `[]` 또는 기존 문서 배열

---

## 2. LLM 레이어 검증 (DeepSeek V4 Flash)

### 2-1. Direct 모드 — SSE 스트리밍 토큰 확인
```bash
curl -s -N -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"안녕하세요! 반갑습니다.", "mode":"direct"}'
```
**예상**:
```
event: sources
data: {"chunks":[...],"session_id":"..."}

event: token
data: {"text":"안"}

event: token
data: {"text":"녕"}
...
event: done
data: {"session_id":"..."}
```
**확인 포인트**:
- [ ] `event: token` 이벤트가 여러 개 나오는지 (스트리밍)
- [ ] `event: done` 이 마지막에 오는지
- [ ] 에러 없이 완료되는지

### 2-2. Direct 모드 — 영어 응답
```bash
curl -s -N -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello! What can you help me with?", "mode":"direct"}'
```
**예상**: 영어로 스트리밍 응답

---

## 3. Agent 모드 검증 (LangGraph + DeepSeek)

### 3-1. 기본 Agent 채팅
```bash
curl -s -N -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"현재 인덱싱된 문서가 있나요?", "mode":"agent"}'
```
**예상**:
```
event: status
data: {"text":"문서 검색...","tool":"search_documents"}

event: token
data: {"text":"..."}
...
event: sources
data: {"chunks":[],"session_id":"..."}

event: done
data: {"session_id":"..."}
```
**확인 포인트**:
- [ ] `event: status` (도구 실행 상태) 이벤트 수신 여부
- [ ] `event: token` 스트리밍 동작 여부
- [ ] `event: sources` 수신 여부
- [ ] `event: done` 마지막에 수신 여부
- [ ] 에러 없이 완료 여부

### 3-2. Agent 세션 ID 유지 (멀티턴)
```bash
# 1차 요청으로 session_id 확보
SESSION=$(curl -s -N -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"안녕"}' | grep '"session_id"' | head -1 | grep -o '"[0-9a-f-]*"' | tr -d '"')

echo "Session: $SESSION"

# 2차 요청 — 동일 session_id 사용
curl -s -N -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"아까 뭐라고 했지?\", \"session_id\":\"$SESSION\"}"
```
**확인 포인트**:
- [ ] `X-Session-Id` 헤더에 세션 ID 포함 여부 (`-I` 플래그로 확인)
- [ ] 동일 세션으로 2차 요청 성공 여부

---

## 4. 검색 레이어 검증 (SQLite FTS5 + Vector)

### 4-1. 원시 검색 (LLM 없이)
```bash
curl -s -X POST http://localhost:4001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"테스트", "top_k":3, "search_mode":"fts"}'
```
**예상**: `[]` 또는 결과 배열 (에러 없이)

### 4-2. 검색 모드별 동작
```bash
# hybrid 모드
curl -s -X POST http://localhost:4001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"문서", "top_k":5, "search_mode":"hybrid"}'

# auto 모드
curl -s -X POST http://localhost:4001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"문서", "search_mode":"auto"}'
```
**확인 포인트**:
- [ ] 세 가지 모드 모두 에러 없이 응답 여부
- [ ] 응답 형태가 배열인지 여부

---

## 5. 문서 업로드 및 인덱싱 검증

### 5-1. 텍스트 파일 업로드 (Markdown)
```bash
# 테스트 문서 생성
cat > /tmp/test_doc.md << 'EOF'
# DeepSeek 마이그레이션 테스트 문서

이 문서는 Mini-RAG 스모크 테스트를 위한 샘플 문서입니다.

## 주요 내용
- DeepSeek V4 Flash 모델 사용
- LangGraph 기반 오케스트레이션
- RAG 검색 기능 검증
EOF

curl -s -X POST http://localhost:4001/api/upload \
  -F "file=@/tmp/test_doc.md"
```
**예상**:
```json
{
  "document_id": 1,
  "file_name": "test_doc.md",
  "format": "markdown",
  "chunks_created": 3,
  "status": "indexed",
  "duplicate": false
}
```
**확인 포인트**:
- [ ] `status: "indexed"` 반환 여부
- [ ] `chunks_created > 0` 여부
- [ ] `document_id` 부여 여부

### 5-2. 중복 업로드 방지
```bash
# 같은 파일 재업로드
curl -s -X POST http://localhost:4001/api/upload \
  -F "file=@/tmp/test_doc.md"
```
**예상**: `{"status":"duplicate","duplicate":true}`

### 5-3. 업로드 후 문서 목록 확인
```bash
curl -s http://localhost:4001/api/documents
```
**예상**: test_doc.md 포함된 배열

### 5-4. 업로드된 문서로 검색 테스트
```bash
curl -s -X POST http://localhost:4001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"DeepSeek 마이그레이션", "top_k":3}'
```
**예상**: test_doc.md 내용이 포함된 검색 결과

### 5-5. 업로드 후 AI 채팅 (RAG 동작 확인)
```bash
curl -s -N -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"DeepSeek 마이그레이션 테스트 문서에 대해 설명해줘", "mode":"direct"}'
```
**확인 포인트**:
- [ ] 응답에 "DeepSeek", "LangGraph" 등 문서 내용 포함 여부
- [ ] `event: sources` 에 `test_doc.md` 파일명 포함 여부

---

## 6. 문서 요약 생성 검증 (DeepSeek API 호출)

### 6-1. 요약 생성 상태 폴링
```bash
# 5-1에서 받은 document_id 사용 (예: 1)
curl -s http://localhost:4001/api/documents/1/summary-status
```
**예상**:
- 즉시: `{"status":"generating","progress":"요약 생성 중..."}`
- 완료: `{"status":"done","title":"...","summary":"..."}`

### 6-2. 요약 완료 후 재검색 (요약본이 RAG에 인덱싱됐는지 확인)
```bash
# 요약 완료 후 (약 30초~2분 후)
curl -s -X POST http://localhost:4001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"전체 요약", "top_k":3}'
```
**예상**: `*_요약.md` 파일명의 결과 포함

---

## 7. 대화 기록 검증

### 7-1. 대화 목록 조회
```bash
curl -s http://localhost:4001/api/conversations
```
**예상**: 앞서 진행한 채팅 세션들의 배열

### 7-2. 특정 대화 내용 조회
```bash
# 대화 ID는 앞 단계에서 확인한 session_id 사용
CONV_ID="<session_id>"
curl -s http://localhost:4001/api/conversations/$CONV_ID
```
**예상**: `{"id":"...","messages":[{"role":"user",...},{"role":"assistant",...}],...}`

### 7-3. 이벤트 로그 조회 (Agent 모드 디버깅)
```bash
curl -s http://localhost:4001/api/conversations/$CONV_ID/events
```
**예상**: `[{"type":"user.message",...},{"type":"agent.tool_start",...},...]`

---

## 8. 작업 로그 & 의도 검증

### 8-1. 작업 로그 조회
```bash
curl -s http://localhost:4001/api/task-log
```
**예상**: 이전 작업들의 배열

### 8-2. 의도 목록 조회
```bash
curl -s http://localhost:4001/api/intents
```
**예상**: `[]` 또는 저장된 의도 배열

---

## 9. 생성 파일 목록 검증

### 9-1. output 파일 목록
```bash
curl -s http://localhost:4001/api/output-files
```
**예상**: `[]` 또는 생성된 파일 배열

---

## 10. 문서 삭제 검증

### 10-1. 문서 삭제
```bash
curl -s -X DELETE http://localhost:4001/api/documents/1
```
**예상**: `{"success":true}`

### 10-2. 삭제 후 목록 확인
```bash
curl -s http://localhost:4001/api/documents
```
**예상**: 빈 배열 또는 해당 문서 없음

### 10-3. 존재하지 않는 문서 삭제 (에러 처리)
```bash
curl -s -X DELETE http://localhost:4001/api/documents/9999
```
**예상**: `404 {"error":"Document not found"}`

---

## 11. 에러 처리 검증

### 11-1. 빈 메시지 요청
```bash
curl -s -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":""}'
```
**예상**: `400 {"error":"message is required"}`

### 11-2. 빈 검색어
```bash
curl -s -X POST http://localhost:4001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":""}'
```
**예상**: `400 {"error":"query is required"}`

### 11-3. 잘못된 문서 ID 삭제
```bash
curl -s -X DELETE http://localhost:4001/api/documents/abc
```
**예상**: `400 {"error":"Invalid document ID"}`

---

## 12. DeepSeek thinking 모드 비활성화 확인

> **중요**: DeepSeek V4 Flash의 thinking 모드가 켜져 있으면 tool calling이 실패합니다.

### 12-1. 도구 호출 포함 Agent 응답 확인
```bash
curl -s -N -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"문서를 검색해서 현황을 알려줘", "mode":"agent"}'
```
**확인 포인트**:
- [ ] `event: status` 에 `tool` 필드가 있는지 (`search_documents` 등)
- [ ] 도구 호출이 정상 완료되는지 (error 이벤트 없음)
- [ ] 응답 내용이 있는지 (빈 응답 X)

---

## 13. 서버 로그 확인 (서버 터미널에서)

서버 기동 시 다음 항목이 출력되는지 확인:

```
[DB] sqlite-vec loaded: v0.1.9 — hybrid search enabled
[DB] Schema initialized
[SkillLoader] Loaded 76/76 skills from ...
[Agents] Loading skills into 11 agent prompts (DeepSeek V4 Flash)...
[Agents] All 11 agents initialized (71 unique skills loaded) — DeepSeek V4 Flash
🚀 Mini-RAG server running at http://localhost:4001
```

- [ ] `sqlite-vec loaded` — 벡터 검색 활성화
- [ ] `76/76 skills` — 스킬 전체 로드
- [ ] `11 agents initialized` — 에이전트 전체 초기화
- [ ] `DeepSeek V4 Flash` 문구 — 마이그레이션 확인

---

## 14. 전체 파이프라인 E2E 테스트

> 단일 흐름으로 전체를 한 번에 검증

```bash
#!/bin/bash
set -e

BASE="http://localhost:4001"

echo "=== 1. Health ==="
curl -sf "$BASE/api/health" | grep '"ok"'

echo "=== 2. Upload ==="
cat > /tmp/e2e_test.md << 'EOF'
# E2E 테스트 문서
Mini-RAG DeepSeek V4 Flash E2E 검증 문서입니다.
핵심어: 인공지능, 언어모델, RAG, DeepSeek
EOF
DOC=$(curl -sf -X POST "$BASE/api/upload" -F "file=@/tmp/e2e_test.md")
echo "$DOC"
DOC_ID=$(echo "$DOC" | grep -o '"document_id":[0-9]*' | grep -o '[0-9]*')

echo "=== 3. Search ==="
curl -sf -X POST "$BASE/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"인공지능 RAG","top_k":2}' | grep -o '"file_name"'

echo "=== 4. Direct Chat ==="
curl -sN -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"DeepSeek RAG 테스트","mode":"direct"}' | grep -c "event: token"

echo "=== 5. Agent Chat ==="
curl -sN -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"E2E 테스트 문서를 요약해줘","mode":"agent"}' | grep "event: done"

echo "=== 6. Cleanup ==="
curl -sf -X DELETE "$BASE/api/documents/$DOC_ID" | grep '"success"'

echo ""
echo "✅ E2E 테스트 완료"
```

---

## 체크리스트 요약표

| # | 항목 | 상태 |
|---|------|------|
| 1-1 | Health Check | ⬜ |
| 1-2 | 인덱스 상태 조회 | ⬜ |
| 1-3 | 문서 목록 조회 | ⬜ |
| 2-1 | Direct 모드 SSE 스트리밍 | ⬜ |
| 2-2 | 영어 응답 | ⬜ |
| 3-1 | Agent 모드 기본 채팅 | ⬜ |
| 3-2 | 멀티턴 세션 유지 | ⬜ |
| 4-1 | FTS 검색 | ⬜ |
| 4-2 | hybrid / auto 검색 | ⬜ |
| 5-1 | 문서 업로드 | ⬜ |
| 5-2 | 중복 업로드 방지 | ⬜ |
| 5-3 | 업로드 후 목록 | ⬜ |
| 5-4 | 업로드 후 검색 | ⬜ |
| 5-5 | 업로드 후 채팅 (RAG) | ⬜ |
| 6-1 | 요약 생성 상태 | ⬜ |
| 6-2 | 요약본 재검색 | ⬜ |
| 7-1 | 대화 목록 | ⬜ |
| 7-2 | 대화 내용 조회 | ⬜ |
| 7-3 | 이벤트 로그 | ⬜ |
| 8-1 | 작업 로그 | ⬜ |
| 8-2 | 의도 목록 | ⬜ |
| 9-1 | 생성 파일 목록 | ⬜ |
| 10-1 | 문서 삭제 | ⬜ |
| 10-2 | 삭제 후 목록 | ⬜ |
| 10-3 | 없는 문서 삭제 404 | ⬜ |
| 11-1 | 빈 메시지 400 | ⬜ |
| 11-2 | 빈 검색어 400 | ⬜ |
| 11-3 | 잘못된 ID 400 | ⬜ |
| 12-1 | thinking 비활성화 (tool 호출) | ⬜ |
| 13 | 서버 로그 확인 | ⬜ |
| E2E | 전체 파이프라인 | ⬜ |

---

## 알려진 제한사항

| 항목 | 내용 |
|------|------|
| **토큰 사용량 추적** | DeepSeek 스트리밍 응답에서 usage 정보 제한적 → `input_tokens: 0`으로 기록됨 |
| **서브에이전트 지연** | LangGraph 서브에이전트 각각 DeepSeek API 호출 → 초기 응답 2-5초 소요 |
| **thinking 모드** | `modelKwargs.thinking` 설정이 일부 LangChain 버전에서 무시될 수 있음 → `on_tool_start` 이벤트로 실제 도구 호출 여부 확인 |
| **MCP 외부 서버** | `memory`, `sequential-thinking`, `fetch` MCP 서버는 현재 비활성화됨 |
