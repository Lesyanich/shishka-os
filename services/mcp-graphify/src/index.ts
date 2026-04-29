#!/usr/bin/env node

/**
 * Shishka Graphify — MCP Server
 *
 * Exposes pre-clustered knowledge graph for cheap architectural queries.
 * Reads graph.json + graph-analytics.json produced by Graphify CLI.
 * 4 tools: query_topic, neighborhood, god_nodes, communities.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// ─── Types ──────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  community: number;
  norm_label?: string;
}

interface GraphLink {
  source: string;
  target: string;
  relation: string;
  confidence?: string;
  confidence_score?: number;
  source_file?: string;
  weight?: number;
}

interface GodNode {
  id: string;
  label: string;
  degree: number;
  source_file: string;
  community: number;
}

interface CommunityInfo {
  id: number;
  label: string;
  size: number;
}

interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface Analytics {
  summary: { nodes: number; edges: number; communities: number };
  god_nodes: GodNode[];
  top_communities: CommunityInfo[];
}

// ─── Graph Loader (cached, mtime-checked) ───────────────────────

const ROOT = resolve(process.env.GRAPHIFY_ROOT ?? process.cwd());
const GRAPH_PATH = resolve(ROOT, "apps/admin-panel/public/graph.json");
const ANALYTICS_PATH = resolve(ROOT, "apps/admin-panel/public/graph-analytics.json");

let cachedGraph: Graph | null = null;
let cachedAnalytics: Analytics | null = null;
let graphMtime = 0;
let analyticsMtime = 0;

function loadGraph(): Graph {
  const mtime = statSync(GRAPH_PATH).mtimeMs;
  if (cachedGraph && mtime === graphMtime) return cachedGraph;
  cachedGraph = JSON.parse(readFileSync(GRAPH_PATH, "utf-8")) as Graph;
  graphMtime = mtime;
  return cachedGraph;
}

function loadAnalytics(): Analytics {
  const mtime = statSync(ANALYTICS_PATH).mtimeMs;
  if (cachedAnalytics && mtime === analyticsMtime) return cachedAnalytics;
  cachedAnalytics = JSON.parse(readFileSync(ANALYTICS_PATH, "utf-8")) as Analytics;
  analyticsMtime = mtime;
  return cachedAnalytics;
}

// ─── Helpers ────────────────────────────────────────────────────

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function matchesKeywords(node: GraphNode, keywords: string[]): number {
  let score = 0;
  const haystack = `${node.id} ${node.label} ${node.source_file ?? ""} ${node.norm_label ?? ""}`.toLowerCase();
  for (const kw of keywords) {
    if (haystack.includes(kw)) score++;
  }
  return score;
}

// ─── Server Setup ───────────────────────────────────────────────

const server = new McpServer({
  name: "shishka-graphify",
  version: "1.0.0",
});

// ─── Tool: graphify_query_topic ─────────────────────────────────

server.tool(
  "graphify_query_topic",
  "Search the Graphify knowledge graph by keywords. Returns top-N matching nodes with their community, source file, and connected edges. " +
  "Use for 'where does X live?' or 'what touches Y?' queries — ~200-500 tokens instead of reading raw files.",
  {
    keywords: z.string().describe("Space-separated keywords to search for (e.g. 'receipt parsing finance')"),
    limit: z.number().min(1).max(50).default(10).describe("Max results to return (default 10)"),
  },
  async ({ keywords, limit }) => {
    const graph = loadGraph();
    const kws = keywords.toLowerCase().split(/\s+/).filter(Boolean);
    if (kws.length === 0) return jsonResult({ error: "No keywords provided" });

    const scored = graph.nodes
      .map(node => ({ node, score: matchesKeywords(node, kws) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const nodeIds = new Set(scored.map(s => s.node.id));

    const results = scored.map(({ node, score }) => {
      const edges = graph.links
        .filter(l => l.source === node.id || l.target === node.id)
        .slice(0, 5)
        .map(l => ({
          relation: l.relation,
          peer: l.source === node.id ? l.target : l.source,
          highlighted: nodeIds.has(l.source === node.id ? l.target : l.source),
        }));

      return {
        id: node.id,
        label: node.label,
        source_file: node.source_file,
        community: node.community,
        relevance: score,
        edges,
      };
    });

    return jsonResult({
      query: keywords,
      total_matches: results.length,
      results,
    });
  },
);

// ─── Tool: graphify_neighborhood ────────────────────────────────

server.tool(
  "graphify_neighborhood",
  "Get the k-hop neighborhood around a node in the knowledge graph. " +
  "Returns the node, its direct neighbors (and optionally 2-hop), with edge labels. " +
  "Use when you know a specific node and want to see what connects to it.",
  {
    node_id: z.string().describe("Node ID to explore (e.g. 'table_nomenclature', 'chef_agent')"),
    depth: z.number().min(1).max(2).default(1).describe("Hop depth: 1 = direct neighbors, 2 = neighbors of neighbors (default 1)"),
  },
  async ({ node_id, depth }) => {
    const graph = loadGraph();
    const center = graph.nodes.find(n => n.id === node_id);
    if (!center) {
      const suggestions = graph.nodes
        .filter(n => n.id.includes(node_id) || n.label.toLowerCase().includes(node_id.toLowerCase()))
        .slice(0, 5)
        .map(n => ({ id: n.id, label: n.label }));
      return jsonResult({ error: `Node '${node_id}' not found`, suggestions });
    }

    const visited = new Set<string>([node_id]);
    const edgesOut: Array<{ source: string; target: string; relation: string; hop: number }> = [];

    let frontier = new Set<string>([node_id]);
    for (let hop = 1; hop <= depth; hop++) {
      const nextFrontier = new Set<string>();
      for (const link of graph.links) {
        if (frontier.has(link.source) && !visited.has(link.target)) {
          nextFrontier.add(link.target);
          edgesOut.push({ source: link.source, target: link.target, relation: link.relation, hop });
        }
        if (frontier.has(link.target) && !visited.has(link.source)) {
          nextFrontier.add(link.source);
          edgesOut.push({ source: link.source, target: link.target, relation: link.relation, hop });
        }
      }
      for (const nid of nextFrontier) visited.add(nid);
      frontier = nextFrontier;
    }

    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    const neighborNodes = [...visited]
      .map(nid => nodeMap.get(nid))
      .filter(Boolean)
      .map(n => ({
        id: n!.id,
        label: n!.label,
        source_file: n!.source_file,
        community: n!.community,
      }));

    return jsonResult({
      center: { id: center.id, label: center.label, source_file: center.source_file, community: center.community },
      depth,
      neighbor_count: neighborNodes.length - 1,
      edge_count: edgesOut.length,
      nodes: neighborNodes,
      edges: edgesOut,
    });
  },
);

// ─── Tool: graphify_god_nodes ───────────────────────────────────

server.tool(
  "graphify_god_nodes",
  "Get the most-connected (highest degree) nodes in the knowledge graph. " +
  "Optionally filter by file path pattern. Use to find architectural hotspots and central abstractions.",
  {
    category: z.string().optional().describe("Optional file path substring filter (e.g. 'finance', 'mcp-chef', 'admin-panel')"),
    limit: z.number().min(1).max(50).default(10).describe("Max results (default 10)"),
  },
  async ({ category, limit }) => {
    const analytics = loadAnalytics();
    let gods = analytics.god_nodes;

    if (category) {
      const cat = category.toLowerCase();
      gods = gods.filter(g =>
        g.source_file.toLowerCase().includes(cat) ||
        g.label.toLowerCase().includes(cat) ||
        g.id.toLowerCase().includes(cat),
      );
    }

    return jsonResult({
      total: gods.length,
      graph_summary: analytics.summary,
      god_nodes: gods.slice(0, limit),
    });
  },
);

// ─── Tool: graphify_communities ─────────────────────────────────

server.tool(
  "graphify_communities",
  "List knowledge graph communities (clusters of related nodes). " +
  "Optionally filter by keyword to find clusters related to a domain. " +
  "Use to understand how the codebase is organized at a high level.",
  {
    category: z.string().optional().describe("Optional keyword to filter community members (e.g. 'finance', 'recipe')"),
  },
  async ({ category }) => {
    const graph = loadGraph();
    const analytics = loadAnalytics();

    if (!category) {
      return jsonResult({
        total_communities: analytics.top_communities.length,
        communities: analytics.top_communities,
      });
    }

    const cat = category.toLowerCase();
    const communityMembers = new Map<number, GraphNode[]>();
    for (const node of graph.nodes) {
      if (!communityMembers.has(node.community)) communityMembers.set(node.community, []);
      communityMembers.get(node.community)!.push(node);
    }

    const matched: Array<{ community_id: number; size: number; matching_members: Array<{ id: string; label: string; source_file?: string }> }> = [];

    for (const [cid, members] of communityMembers) {
      const matching = members.filter(m =>
        m.id.toLowerCase().includes(cat) ||
        m.label.toLowerCase().includes(cat) ||
        (m.source_file ?? "").toLowerCase().includes(cat),
      );
      if (matching.length > 0) {
        matched.push({
          community_id: cid,
          size: members.length,
          matching_members: matching.map(m => ({ id: m.id, label: m.label, source_file: m.source_file })),
        });
      }
    }

    matched.sort((a, b) => b.matching_members.length - a.matching_members.length);

    return jsonResult({
      query: category,
      matched_communities: matched.length,
      communities: matched.slice(0, 15),
    });
  },
);

// ─── Start ──────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
