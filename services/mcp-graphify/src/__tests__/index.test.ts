import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../..");
const GRAPH_PATH = resolve(ROOT, "apps/admin-panel/public/graph.json");
const ANALYTICS_PATH = resolve(ROOT, "apps/admin-panel/public/graph-analytics.json");

describe("Graphify MCP prerequisites", () => {
  it("graph.json exists and has nodes", () => {
    expect(existsSync(GRAPH_PATH)).toBe(true);
    const graph = JSON.parse(readFileSync(GRAPH_PATH, "utf-8"));
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it("graph-analytics.json exists and has god_nodes", () => {
    expect(existsSync(ANALYTICS_PATH)).toBe(true);
    const analytics = JSON.parse(readFileSync(ANALYTICS_PATH, "utf-8"));
    expect(Array.isArray(analytics.god_nodes)).toBe(true);
    expect(analytics.god_nodes.length).toBeGreaterThan(0);
  });

  it("graph nodes have required fields", () => {
    const graph = JSON.parse(readFileSync(GRAPH_PATH, "utf-8"));
    const node = graph.nodes[0];
    expect(node).toHaveProperty("id");
    expect(node).toHaveProperty("label");
    expect(node).toHaveProperty("community");
  });

  it("graph links have source and target", () => {
    const graph = JSON.parse(readFileSync(GRAPH_PATH, "utf-8"));
    const link = graph.links[0];
    expect(link).toHaveProperty("source");
    expect(link).toHaveProperty("target");
    expect(link).toHaveProperty("relation");
  });
});
