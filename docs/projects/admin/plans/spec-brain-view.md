# Spec: Brain View — Visual Knowledge Graph in Admin Panel (L2 LightRAG)

> MC Task: `efebcbb1-6699-432e-a8a0-f8c2a6e26842`
> Priority: medium
> Domain: tech
> Project: admin-panel
> Branch: `feature/admin/brain-view`
> Estimated: 1 session (~60–90 min) for MVP
> Parent spec: `docs/plans/spec-shishka-brain.md` (umbrella)
> Depends on: LightRAG Phase 1 ✅ (running on `:9621`), MemPalace Phase 2 ✅ (not consumed by MVP, see §6)

## 1. Context

Shishka Brain v2 has three layers: **L1 MemPalace** (conversations), **L2 LightRAG** (project knowledge), **L3 Graphify** (code structure). LightRAG Phase 1 closed with a working server on `localhost:9621` indexing `docs/bible/` + `docs/domain/` (currently 43 nodes, 18 edges, growing). The CEO needs to *see* this knowledge — what entities exist, how they relate, where the gaps are. Without a visual layer, the graph is invisible and we cannot spot missing entities, isolated nodes, or relation drift.

This task ships the **first interactive Brain tab** in admin-panel: a force-directed graph rendered from LightRAG's `/graphs` endpoint, with click-to-expand, search, and entity-type filters.

**Explicit non-goal for MVP:** L1 MemPalace tab and L3 Graphify tab. L1 has no UI-friendly read API yet, L3 is deferred. This MVP ships **only the L2 tab**, but the routing structure (`/brain/lightrag`, `/brain/mempalace` placeholder) leaves room for L1/L3 to slot in later without re-architecting.

## 2. Scope (MVP)

### 2.1 New route `/brain` in admin-panel
- Add `/brain` to admin router with subroutes `/brain/lightrag` (active MVP) and placeholder tabs `/brain/mempalace` and `/brain/code` (showing "Coming in Phase 2/Phase 3" empty state)
- Side nav entry "Brain" with brain emoji or lucide icon `Brain`
- Tab strip at top of `/brain` page switching between L1/L2/L3

### 2.2 LightRAG graph view (`/brain/lightrag`)
- **Renderer:** `react-force-graph-2d` (npm package). 43 nodes today, expected to stay <5k for next year. Cosmograph (GPU) is overkill at this scale and adds bundle weight. Document the migration path in code comment for when graph crosses 5k nodes.
- **Data source:** direct REST to `http://localhost:9621/graphs?label=*&max_depth=3&max_nodes=500`. No MCP wrapper exists yet — add `// TODO(brain-view): switch to MCP wrapper when shishka-lightrag MCP server ships` next to fetch call.
- **Auth:** read `VITE_LIGHTRAG_API_KEY` from env (may be empty for local dev — server runs without auth in dev). Pass via `api_key_header_value` query param if non-empty.
- **Initial load:** fetch all labels via `/graph/label/list`, render full graph for label `*` (all entities) with `max_nodes=500` cap.
- **Interactions:**
  - Click node → side panel opens with entity name, type, description, source documents (if available in node payload), and "Related entities" list
  - Hover node → tooltip with name + type
  - Drag nodes (built into force-graph)
  - Scroll to zoom, click-drag empty space to pan
  - Search box (top-left): debounced 300ms, calls `/graph/label/search?q=<input>&limit=20`, focuses graph on first match
- **Filters (right sidebar):**
  - Entity type checkboxes (derive types from node `entity_type` field after first fetch — do not hardcode)
  - "Show isolated nodes" toggle (default: on)
  - Max nodes slider: 100 / 500 / 1000 / all
- **Color scheme:** color nodes by `entity_type` (one color per type, deterministic — use a small palette of 8 distinct colors, fall back to gray for unknown types). Edge thickness by relation count if available.

### 2.3 Empty/error states
- **LightRAG server unreachable:** show "LightRAG server not running on `:9621`. Start it via `services/lightrag/run-server.sh` and refresh." with refresh button.
- **Empty graph (0 nodes):** show "No entities indexed yet. Run an ingest." with link to `/brain/lightrag/ingest` (out of MVP — link can 404 for now).
- **API error (non-2xx):** show error message + raw response in collapsible details.

### 2.4 Operations.md gotcha (per existing comment d6f18983)
`docs/bible/operations.md` was injected via `ainsert_custom_kg`, has no `doc-*` id, **does not appear in `GET /documents`** but its entities DO appear in the graph. The Brain View MVP does not need to deal with the document list — only the graph. So this gotcha is informational, not blocking. Do not try to render a "documents" sidebar in MVP.

## 3. API Contract — LightRAG endpoints used

| Endpoint | Used for | Verified |
|---|---|---|
| `GET /graphs?label=&max_depth=&max_nodes=&api_key_header_value=` | Main graph fetch | ✅ exists in `/openapi.json` |
| `GET /graph/label/list` | Populate entity-type filter | ✅ exists |
| `GET /graph/label/search?q=&limit=` | Search box | ✅ exists |
| `GET /health` | Connection check on mount | ✅ exists |

**Verify response shape during implementation** — `/openapi.json` lists endpoints but the exact JSON shape of `/graphs` should be inspected with a real curl call before wiring it into the renderer. Do not assume; print + adapt.

## 4. UI/UX Details

- **Layout:** full-height page, top tab strip (L1/L2/L3), main canvas takes ~75% width, right filter panel ~25%, collapsible
- **Dark mode:** must work in both — react-force-graph supports custom node/link color funcs, use existing admin-panel theme tokens
- **Performance:** for 500 nodes react-force-graph-2d is smooth on M-series Mac. If we ever hit 5k, switch to `react-force-graph-3d` or Cosmograph — leave migration TODO comment in component
- **Responsive:** desktop-only for MVP. Hide right panel below `lg` breakpoint, show "Filters" button that opens drawer

## 5. Files (planned)

- `apps/admin-panel/src/pages/brain/BrainPage.tsx` — tab strip + routing
- `apps/admin-panel/src/pages/brain/LightragGraph.tsx` — graph component
- `apps/admin-panel/src/pages/brain/components/NodeDetailPanel.tsx` — side panel
- `apps/admin-panel/src/pages/brain/components/GraphFilters.tsx` — right sidebar filters
- `apps/admin-panel/src/api/lightrag.ts` — typed REST client (`fetchGraph`, `searchLabels`, `listLabels`, `health`)
- `apps/admin-panel/src/router.tsx` — add `/brain` routes
- `apps/admin-panel/src/components/Sidebar.tsx` — add Brain nav entry
- `apps/admin-panel/.env.example` — add `VITE_LIGHTRAG_BASE_URL` (default `http://localhost:9621`) and `VITE_LIGHTRAG_API_KEY` (empty default)

**Out of scope (do not touch):** `services/lightrag/`, any backend, any docs/bible content, any other admin-panel pages.

## 6. Explicit Non-Goals (Phase boundaries)

- ❌ L1 MemPalace tab — placeholder only, real implementation is a separate task after MemPalace gets a read API
- ❌ L3 Graphify tab — placeholder only, deferred until Phase 3
- ❌ Ingest UI — viewing only, no upload/delete from this view
- ❌ Editing entities — `/graph/entity/edit` exists but MVP is read-only
- ❌ MCP wrapper — direct REST is fine for MVP, migration path documented in code
- ❌ Live updates / polling — manual refresh button is enough for MVP (graph changes are infrequent)
- ❌ Production deployment — LightRAG server is local-only, Brain View only works on CEO's Mac for now (acceptable, matches Phase 1 limitation)
- ❌ Authentication on the admin-panel side — admin-panel already has its own auth layer

## 7. Acceptance Criteria

1. Navigating to `/brain/lightrag` renders an interactive force graph with all 43 current LightRAG entities
2. Clicking a node opens a side panel with that entity's details
3. Search box finds entities by name with debounced API calls
4. Entity-type filter checkboxes hide/show nodes correctly
5. With LightRAG server stopped, page shows the "server unreachable" state, not a white screen or React error boundary
6. Dark mode renders correctly (no white-on-white or black-on-black)
7. `/brain/mempalace` and `/brain/code` routes load the placeholder "Coming soon" panel without crashing
8. No new lint errors, no new TypeScript errors, `pnpm build` passes in `apps/admin-panel`
9. PR description includes a screenshot of the graph rendering at least 10 nodes

## 8. Open Questions for /code

If any of these block progress, comment on the MC task and pause — do not guess:

1. **Exact `/graphs` response shape** — verify with curl before wiring; may need a small adapter layer
2. **Entity type field name** — likely `entity_type` but verify in actual response
3. **Source documents in node payload** — if not present, the side panel "Source docs" section can be hidden in MVP
4. **Edge label availability** — if edges have `description` or `keywords`, surface them in tooltips; if not, just show source→target

## 9. Out-of-Band Reference

- LightRAG running locally: `services/lightrag/run-server.sh`
- Existing Phase 1 state: 43 nodes / 18 edges, gemma4:e2b + bge-m3
- Engineering rule: `RULE-OLLAMA-MODEL-NAME-NORMALIZATION` (in `docs/constitution/engineering-rules.md`) — relevant only if you touch model names
- Sister specs in `docs/projects/admin/plans/`: `spec-mc-ux-polish.md` for code style and structure conventions
- Umbrella: `docs/plans/spec-shishka-brain.md` §4 Phase 2 (for L1 architectural decisions you must NOT re-litigate)

## 10. Phase 1.5 / Future

- L1 MemPalace tab — separate task once MemPalace exposes a graph-shaped read API
- L3 Graphify tab — separate task post Phase 3 spike
- Live updates via SSE or polling — defer until graph grows past ~500 nodes and manual refresh becomes annoying
- MCP wrapper switch — defer until shishka-lightrag MCP server is created
- Cosmograph migration — defer until graph crosses 5k nodes
