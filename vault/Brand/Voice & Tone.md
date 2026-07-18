---
title: Brand Voice & Tone
type: page
tags: [brand, voice, copy]
date: 2026-04-29
status: active
related:
  - "[[Brand/]]"
  - "[[Brand/Identity]]"
---

# Brand Voice & Tone

> **📅 As of April 2026 — historical record, not current state.** Kept for history; not maintained as current.

How Shishka talks — to a guest in front of the salad bar, to an investor in a deck, to a partner in an email, to its own staff in a checklist. Synthesised from [[Brand/Identity]] + agent-personality conventions used in `agents/coo/AGENT.md` and `agents/chef/AGENT.md`.

## Voice principles

| Principle | What it means | What it isn't |
|---|---|---|
| **Functional, not preachy** | We say what the food does — for energy, gut, focus. We don't moralize about "wellness". | "Eat clean!" / "Detox!" / "Guilt-free indulgence!" |
| **Specific, not vague** | "Lacto-fermented kraut, 30-day cellar"  > "probiotic salad" | "Healthy" / "fresh" / "natural" / "wholesome" |
| **Confident, not chatty** | Statements, not questions. We know what we cook. | Hashtag-heavy IG-bro speak. No emojis in copy. |
| **Sensory + technical** | Smell, crunch, mouthfeel + a real reason it works (Maillard, fiber density, bio-availability). | Empty hyperbole ("explosion of flavor") |
| **Russian–Arab–Thai-aware** | We name dishes from real culinary references (manakish, syrniki, tom kha) — never invent fusion-jargon. | "Wellness fusion bowl with global notes" |

## The guest persona

**Conscious Optimizer.** Expat or tourist in Rawai — digital nomads, athletes, yogis. Not buying "food" — buying **Green Insurance**.

What they want from copy:

- **Functionality** — what's in this for my energy / sleep / digestion?
- **Trust** — clean label, transparent composition, no hidden oils or sugars
- **Time saved** — grab-and-go speed at chef-led restaurant quality

Every piece of copy is judged against this persona. If it doesn't serve them, it doesn't ship.

## Tone register by context

| Context | Register | Example |
|---|---|---|
| Menu copy (customer-facing) | **Confident + sensory** | *Sous-vide chicken, Merrychef-finished for crisp crust. Buckwheat with truffle oil. Pumpkin seeds.* |
| Investor / partner | **Operator + numbers** | *FC ≤ 30%. CBS reduces L2 prep to 60s/bowl. Cook-chill extends shelf life to 7–10 days.* |
| Internal SOPs | **Imperative + checklist** | *Receive → check temp ≤ +8°C → reject if higher → log batch in HACCP sheet.* |
| Owner ↔ agent chat (Russian) | **Direct + actionable** | Conversation is in Russian; storage (DB, MC, code, commits, specs) is English. See `RULE-LANGUAGE-CONTRACT`. |
| Agent ↔ agent (English) | **Engineering-tight** | Numbers, IDs, paths. No filler. See agent AGENT.md files. |

## Words to avoid

- **"Wellness"** — vague, soft, Instagram-bro coded. Use *functional* or name the actual benefit.
- **"Detox"** — pseudoscience adjacent. Liver detoxes itself; we just feed it good fuel.
- **"Guilt-free"** — implies food is shameful. We sell celebration of real ingredients, not absolution.
- **"Superfood"** as filler — only use when there's a specific bioactive worth naming (Lion's Mane, sumac, lacto-fermented X).
- **"Fresh"** as the only adjective — every restaurant claims this. Be specific (*cold-pressed*, *24h-fermented*, *sous-vide-locked*).

## Words we own

- **Green Insurance** — the brand's North Star metaphor.
- **Algorithm Bowl** — the salad-bar build mechanism (Fiber Base + Sustain-Pro + Bio-Active + Crunch).
- **Culinary Booster System** / **CBS** — the flavor-LEGO framework.
- **Bio-Active Borscht / Functional Fungi / Pumpkin Fusion** — proper named dishes (see [[Menu/Categories]]).

## Multilingual rule

`RULE-LANGUAGE-CONTRACT` (in `docs/constitution/core-rules.md`):
- **Conversation:** human's language (CEO ↔ agent in Russian; partner ↔ in their language)
- **Storage** (DB, MC, code, commits, specs, vault): **English only, no exceptions**

This page is English. The repo, vault, and Mission Control are English. Marketing copy lives wherever it ships (English / Russian / Thai), but the *spec* of that copy lives in the vault in English.

## See Also

- [[Brand/Identity]] — the positioning this voice translates
- [[Brand/Visual System]] — visual companion to the verbal voice
- [`docs/constitution/core-rules.md`](../../docs/constitution/core-rules.md) — RULE-LANGUAGE-CONTRACT
