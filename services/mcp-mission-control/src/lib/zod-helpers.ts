/**
 * Zod preprocessing helpers for MCP tool schemas.
 *
 * Some MCP clients JSON-stringify non-primitive arguments (arrays, records)
 * before they reach the server. Plain `z.array(...)` / `z.record(...)` schemas
 * then reject the stringified payload with "expected array, received string"
 * (see COO session 9 bug capture in task 355bb967 comments).
 *
 * Sibling fix for numeric-coerce bug: `z.coerce.number().int()` in `list_*`
 * limit fields (commit f9bfa37, task 979ed751).
 *
 * These helpers wrap a base Zod schema with `z.preprocess` that transparently
 * JSON.parse-s a string before validation, so both serialized and native
 * payloads are accepted.
 */

import { z, type ZodTypeAny } from "zod";

/**
 * If `value` is a string, try to JSON.parse it. Otherwise pass through.
 * On parse error, return the original string so the downstream schema
 * emits a meaningful "expected array, received string" error instead of
 * a cryptic SyntaxError.
 */
export function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** `z.array(inner)` that also accepts a JSON-stringified array. */
export function jsonArray<T extends ZodTypeAny>(inner: T) {
  return z.preprocess(parseJsonIfString, z.array(inner));
}

/** `z.record(key, value)` that also accepts a JSON-stringified object. */
export function jsonRecord<K extends z.ZodString, V extends ZodTypeAny>(
  key: K,
  value: V,
) {
  return z.preprocess(parseJsonIfString, z.record(key, value));
}
