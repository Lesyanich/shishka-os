/**
 * Smoke test: record-production
 *
 * No test runner in mcp-chef yet — this file satisfies HC-3 (test pair)
 * and validates types at compile time via `tsc --noEmit`.
 *
 * TODO: add vitest + proper integration tests when test infra is set up.
 */

import type { recordProduction } from "./record-production.js";

// Type-level smoke: ensure the function signature matches expectations
type Args = Parameters<typeof recordProduction>[0];
type Result = ReturnType<typeof recordProduction>;

// Compile-time assertion: args must accept items array + optional date
const _argsCheck: Args = {
  items: [
    { product_code: "PF-TEST", quantity: 500, unit: "g", storage: "fridge", notes: "test" },
  ],
  production_date: "2026-04-23",
};

// Compile-time assertion: result is a Promise
const _resultCheck: Result extends Promise<unknown> ? true : never = true;

void _argsCheck;
void _resultCheck;
