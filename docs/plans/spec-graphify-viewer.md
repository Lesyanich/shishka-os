# Spec: Graphify Interactive Viewer

> MC Task: a48e82b3-73d6-4f9d-a7a8-0ea54090b0ed
> Priority: medium
> Status: spec-ready
> Branch: TBD (feature/admin/graphify-viewer)

## 1. Problem

`/brain/graphify` shows a static placeholder. Graphify is installed with 1,750 nodes, 1,906 edges, and 304 communities — but there's no way to explore the graph in the admin panel. CEO and agents can't visually navigate project knowledge, find connections, or understand community structure.

## 2. Data Source

### graph.json (NetworkX JSON)

Location: `graphify-out/graph.json` (~1.1 MB)

**Node schema:**
```json
{
  "id": "apps_admin_panel_src_app_tsx",
  "label": "App.tsx",
  "file_type": "code",
  "source_file": "apps/admin-panel/src/App.tsx",
  "source_location": "L1",
  "community": 180
}
```

**Edge schema:**
```json
{
  "source": "apps_admin_panel_src_app_tsx",
  "target": "app_pageloader",
  "relation": "contains",
  "confidence": "EXTRACTED",
  "confidence_score": 1.0,
  "source_file": "apps/admin-panel/src/App.tsx",
  "weight": 1.0
}
```

**Hyperedges** (graph-level, 11 total): multi-node relationship clusters with `relation` and `source_file`.

**Key fields for visualization:**
- `community` (int, 0–303) — Leiden community ID, use for coloring
- `file_type` — node category (code, doc, config, etc.)
- `relation` — edge label (contains, imports, calls, references, etc.)
- `confidence` — EXTRACTED vs INFERRED

### Existing asset: graph.html

Graphify ships a built-in HTML viewer (`graphify-out/graph.html`, 265 lines, 62 KB). This is a self-contained D3 force-directed graph. Could be embedded as a quick Phase 1.

## 3. Design

### Phase 1 — Embed existing viewer (quick win)

Replace `BrainPlaceholder` with an `<iframe>` loading `graph.html` from a static path or inline. Add a minimal toolbar above:
- Stats bar: "1,750 nodes · 1,906 edges · 304 communities"
- "Open full screen" button
- "Re-index" button (calls `graphify --update` — future, disabled for now)

**Scope:** 1 file changed (`App.tsx` route), 1 new component (`GraphifyEmbed.tsx`).

**Why iframe first:** The built-in viewer already handles force layout, zoom, pan, node labels. Building a custom renderer for 1,750 nodes is non-trivial; embedding gives immediate value while Phase 2 is designed properly.

### Phase 2 — Custom React viewer (full feature)

Replace the iframe with a native React component using **Sigma.js + Graphology** (recommended) or **react-force-graph-2d**.

**Library choice rationale:**

| Library | Pros | Cons |
|---------|------|------|
| **Sigma.js + Graphology** | WebGL renderer, handles 10K+ nodes, rich plugin ecosystem, good React wrapper (`@react-sigma/core`) | Learning curve, heavier bundle |
| react-force-graph-2d | Simple API, force-directed, React-native | Canvas-based, struggles above 5K nodes |
| D3 raw | Maximum control | No React integration, manual everything |

**Recommendation: Sigma.js + Graphology** — the graph will grow, and WebGL scales better.

**Features:**
1. **Graph canvas** — force-directed layout with WebGL rendering
2. **Community coloring** — each `community` ID gets a distinct color (use palette with 20 colors, wrap for 304)
3. **Node size** — by degree (more connections = larger)
4. **Search** — fuzzy text search on `label`, highlights matching node and its neighborhood
5. **Filter panel:**
   - By `file_type` (checkboxes: code, doc, config, etc.)
   - By `community` (dropdown or clickable legend)
   - By `confidence` (toggle INFERRED edges)
6. **Node detail panel** (click a node):
   - Label, file_type, source_file, community
   - List of connected nodes with edge relation
   - "Open in code" link (for code file_type — link to source_file)
7. **Edge labels** — show `relation` on hover
8. **Hyperedge cards** — separate section below graph showing the 11 hyperedges as grouped cards
9. **Layout toggle** — force-directed vs community-clustered (ForceAtlas2 vs circular-by-community)

### Component structure

```
src/pages/brain/
├── GraphifyViewer.tsx          # Main component (lazy-loaded)
├── components/
│   ├── GraphCanvas.tsx         # Sigma.js wrapper
│   ├── GraphSearch.tsx         # Search input + results
│   ├── GraphFilters.tsx        # file_type + community filters
│   ├── NodeDetailPanel.tsx     # Side panel on node click
│   └── HyperedgeCards.tsx      # Hyperedge summary cards
```

### Data loading

Phase 1: Static import from `public/graph.json` (copy at build time or fetch from known path).
Phase 2: API route that reads `graphify-out/graph.json` — or better, Graphify `--mcp` mode returns the graph on demand.

For now (Vite): copy `graphify-out/graph.json` to `apps/admin-panel/public/graph.json` at build time (vite plugin or npm script). Fetch on mount via `fetch('/graph.json')`.

## 4. Dependencies

### Phase 1
- None (iframe embed)

### Phase 2
- `@react-sigma/core` — React bindings for Sigma.js
- `graphology` — graph data structure
- `graphology-layout-forceatlas2` — layout algorithm
- `sigma` — WebGL graph renderer

Estimated bundle addition: ~120 KB gzipped (Sigma.js is tree-shakeable).

## 5. Acceptance Criteria

### Phase 1 (embed)
- [ ] `/brain/graphify` shows the interactive graph (not placeholder)
- [ ] Stats bar shows node/edge/community counts
- [ ] Graph is navigable (zoom, pan, click)
- [ ] No new npm dependencies added

### Phase 2 (custom viewer)
- [ ] Graph renders all 1,750 nodes without jank (60fps pan/zoom)
- [ ] Nodes colored by community
- [ ] Search finds nodes by label within 200ms
- [ ] Click node opens detail panel with connections
- [ ] Filter by file_type hides/shows nodes
- [ ] INFERRED edges toggleable
- [ ] Hyperedges displayed as cards
- [ ] TypeScript strict, no `any`
- [ ] Lighthouse performance score > 80 on /brain/graphify

## 6. Out of Scope

- Real-time graph updates (Graphify re-index is manual CLI)
- Graph editing (add/remove nodes from UI)
- 3D visualization
- Agent query integration via UI (agents use `--mcp` mode directly)

## 7. Phasing Recommendation

**Phase 1 first** — gives CEO a working viewer in ~30 minutes of dev time. Ship it, get feedback, then decide if Phase 2 is needed or if the built-in viewer is sufficient.

**Phase 2** — only if CEO wants search, filtering, or the built-in viewer is insufficient for daily use.
