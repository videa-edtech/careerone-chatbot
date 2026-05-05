# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1.0] - 2026-04-14

### Added
- **CareerONE Widget Support** — `/rag-widget` route serves a stripped-down chat UI for iframe/widget embedding
- **SSE + Poll Fallback** — `POST /api/chat/poll` JSON endpoint as fallback when SSE is blocked by proxies or CORS restrictions
- **SSE Timeout Protection** — 60-second timeout on SSE connections prevents hanging sessions
- **WidgetChat Component** — Reusable stripped-down chat UI using existing MessageBubble component
- **useWidgetChat Hook** — React hook managing SSE streaming, 3-second poll fallback timer, session persistence, and error handling

### Changed
- **CLAUDE.md** — Updated with full project documentation, 76 skills, and development commands
- **vitest setup** — Added vitest configuration for backend testing

### Fixed
- **SSE stream error handling** — Added try/catch around token streaming loop to prevent connection leaks on stream errors
