import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJsonIfString, jsonArray, jsonRecord } from "../lib/zod-helpers.js";

describe("parseJsonIfString", () => {
  it("passes through non-string values unchanged", () => {
    expect(parseJsonIfString(["a", "b"])).toEqual(["a", "b"]);
    expect(parseJsonIfString({ k: "v" })).toEqual({ k: "v" });
    expect(parseJsonIfString(42)).toBe(42);
    expect(parseJsonIfString(undefined)).toBe(undefined);
    expect(parseJsonIfString(null)).toBe(null);
  });

  it("JSON.parses a string and returns the parsed value", () => {
    expect(parseJsonIfString('["a","b"]')).toEqual(["a", "b"]);
    expect(parseJsonIfString('{"k":"v"}')).toEqual({ k: "v" });
  });

  it("returns the original string on parse error", () => {
    expect(parseJsonIfString("not json")).toBe("not json");
    expect(parseJsonIfString("[unclosed")).toBe("[unclosed");
  });
});

describe("jsonArray", () => {
  const schema = jsonArray(z.string());

  it("accepts a native array", () => {
    expect(schema.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("accepts a JSON-stringified array (the bug this fixes)", () => {
    expect(schema.parse('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("rejects a non-array payload", () => {
    expect(() => schema.parse("plain string")).toThrow();
    expect(() => schema.parse(42)).toThrow();
    expect(() => schema.parse({ k: "v" })).toThrow();
  });

  it("enforces inner schema on stringified input", () => {
    // array of numbers stringified → rejected because inner is z.string()
    expect(() => schema.parse("[1,2,3]")).toThrow();
  });

  it("composes with .optional()", () => {
    const opt = jsonArray(z.string()).optional();
    expect(opt.parse(undefined)).toBe(undefined);
    expect(opt.parse(["a"])).toEqual(["a"]);
    expect(opt.parse('["a"]')).toEqual(["a"]);
  });
});

describe("jsonRecord", () => {
  const schema = jsonRecord(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  );

  it("accepts a native object", () => {
    expect(schema.parse({ pr_number: 34, branch: "main", merged: true })).toEqual({
      pr_number: 34,
      branch: "main",
      merged: true,
    });
  });

  it("accepts a JSON-stringified object (the bug this fixes)", () => {
    expect(schema.parse('{"pr_number":34,"branch":"main"}')).toEqual({
      pr_number: 34,
      branch: "main",
    });
  });

  it("rejects a non-object payload", () => {
    expect(() => schema.parse("plain")).toThrow();
    expect(() => schema.parse(42)).toThrow();
    expect(() => schema.parse(["a"])).toThrow();
  });

  it("enforces value-union on stringified input", () => {
    // null is not in the union → rejected even when delivered as stringified object
    expect(() => schema.parse('{"k":null}')).toThrow();
  });

  it("composes with .optional()", () => {
    const opt = jsonRecord(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]),
    ).optional();
    expect(opt.parse(undefined)).toBe(undefined);
    expect(opt.parse({ k: "v" })).toEqual({ k: "v" });
    expect(opt.parse('{"k":"v"}')).toEqual({ k: "v" });
  });
});
