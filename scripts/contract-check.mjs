#!/usr/bin/env node
/*
  Menu contract check — identical file in shishka-health and shishka-os.

  Asks production for exactly what src/hooks/useMenu.js asks for, column by column.
  A dropped or renamed column comes back as HTTP 400 naming it; tightened RLS comes
  back as 401 or an empty result; a renamed category trips a semantic assertion.

  No secret, no staging database, no local Supabase: the anon key is public and the
  contract is fetched over HTTPS, so this runs the same from either repo and from CI.

  Usage:
    node scripts/contract-check.mjs                 # every baseUrl in the contract
    node scripts/contract-check.mjs --base=https://shishka.health/sb
    node scripts/contract-check.mjs --contract=https://raw.githubusercontent.com/...
    node scripts/contract-check.mjs --json

  Exit code 0 = contract intact, 1 = the live site is broken or about to be.
*/

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONTRACT = join(HERE, "..", "contracts", "menu-contract.json");
const REMOTE_CONTRACT =
  "https://raw.githubusercontent.com/Lesyanich/shishka-health/main/contracts/menu-contract.json";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const asJson = args.includes("--json");
const TIMEOUT_MS = Number(flag("timeout") ?? 20000);
const ATTEMPTS = Number(flag("attempts") ?? 3);

async function loadContract() {
  const explicit = flag("contract");
  if (explicit && /^https?:/.test(explicit)) return (await fetch(explicit)).json();
  const path = explicit ?? DEFAULT_CONTRACT;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  // Running from shishka-os, where the contract belongs to the other repo.
  const res = await fetch(REMOTE_CONTRACT);
  if (!res.ok) throw new Error(`cannot fetch contract: HTTP ${res.status} ${REMOTE_CONTRACT}`);
  return res.json();
}

/** One PostgREST read. Returns { ok, status, count, body }. Retries transient failures only. */
async function probe(base, key, path) {
  const url = `${base.replace(/\/$/, "")}/rest/v1/${path}`;
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
        signal: ac.signal,
      });
      const body = await res.text();
      const count = Number(res.headers.get("content-range")?.split("/")[1] ?? NaN);
      // 4xx is a real answer about the schema — never retry it, that is the finding.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return { ok: res.ok, status: res.status, count, body: body.slice(0, 400) };
      }
      last = { ok: false, status: res.status, count: NaN, body: body.slice(0, 400) };
    } catch (err) {
      last = { ok: false, status: 0, count: NaN, body: String(err.message ?? err) };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return last;
}

async function checkBase(contract, base, key) {
  const results = [];

  for (const r of contract.resources) {
    const q = [`select=${encodeURIComponent(r.select)}`, r.query, "limit=1"].filter(Boolean).join("&");
    const res = await probe(base, key, `${r.name}?${q}`);
    const min = r.minRows ?? 0;
    let detail = "";
    let pass = res.ok;
    if (!res.ok) {
      detail = `HTTP ${res.status || "network"} — ${res.body}`;
    } else if (Number.isFinite(res.count) && res.count < min) {
      pass = false;
      detail = `returned ${res.count} rows, expected at least ${min} (RLS or empty table)`;
    } else {
      detail = `${res.count} rows`;
    }
    results.push({ kind: "resource", id: r.name, pass, detail });
  }

  for (const a of contract.assertions) {
    const q = [a.query, "select=id", "limit=1"].filter(Boolean).join("&");
    const res = await probe(base, key, `${a.resource}?${q}`);
    let pass = res.ok;
    let detail = "";
    if (!res.ok) {
      detail = `HTTP ${res.status || "network"} — ${res.body}`;
    } else if (a.min != null && res.count < a.min) {
      pass = false;
      detail = `matched ${res.count}, expected at least ${a.min} — ${a.why}`;
    } else if (a.max != null && res.count > a.max) {
      pass = false;
      detail = `matched ${res.count}, expected at most ${a.max} — ${a.why}`;
    } else {
      detail = `matched ${res.count}`;
    }
    results.push({ kind: "assertion", id: a.id, pass, detail });
  }

  return results;
}

let contract;
try {
  contract = await loadContract();
} catch (err) {
  console.error(`Could not load the menu contract: ${err.message}`);
  console.error(
    "It is canonical in the shishka-health repo at contracts/menu-contract.json and is read " +
      "from main over raw.githubusercontent.com. A 404 usually means the branch that adds it " +
      "has not been merged yet — merge shishka-health first, then this repo.",
  );
  process.exit(1);
}

const key = process.env.SUPABASE_ANON_KEY || contract.anonKey;
if (!key) {
  console.error("No anon key: set SUPABASE_ANON_KEY or add anonKey to the contract.");
  process.exit(1);
}

const bases = flag("base") ? [flag("base")] : contract.baseUrls;
const report = {};
let failed = 0;

for (const base of bases) {
  const results = await checkBase(contract, base, key);
  report[base] = results;
  failed += results.filter((r) => !r.pass).length;

  if (!asJson) {
    console.log(`\n${base}`);
    for (const r of results) {
      console.log(`  ${r.pass ? "ok  " : "FAIL"}  ${r.id.padEnd(24)} ${r.detail}`);
    }
  }
}

if (asJson) console.log(JSON.stringify(report, null, 2));

if (failed) {
  console.error(
    `\n${failed} contract check(s) failed. The public menu at shishka.health depends on these ` +
      `objects; it fails by showing stale prices, not by erroring. Fix the database or update ` +
      `contracts/menu-contract.json in the shishka-health repo.`,
  );
  process.exit(1);
}

console.log(`\nContract intact across ${bases.length} endpoint(s).`);
