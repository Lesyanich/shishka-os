# Roadmap Public v1 — Design Spec (exploration)

**File:** `agents/designer/designs/roadmap-public-v1/index.html`
**Deliverable for:** `/opening` on `shishka.health` (customer-facing public countdown page, if we ship it).
**Status:** exploratory draft v0.1 — no commitment to ship. Designer/CEO review before tech port.
**⚠️ Not a token source.** The cream/paper palette below is a one-off concept for this page.
Brand tokens live in the `shishka-health` repo (`design-system/MASTER.md` + `src/styles/tokens/`).
Do not copy hexes from here into any product surface.
**Date:** 2026-04-24.
**Companion to:** `agents/designer/designs/roadmap-v1/` (dark, owner-facing variant).

## Why a second variant

The owner roadmap at `/roadmap` is a **late-night-kitchen** surface: dark parchment,
marginalia, blockers panel, MC task IDs, owner chips. It's a control tool for Lesya and Bas.

A **public opening page** has a different job:

- Audience is **guests**, not operators — they want to know "when can I eat there?" and "what's it going to be like?"
- Nothing actionable — no task lists, no blockers, no MC links.
- Brand voice is **warm, inviting, a little ceremonial**. Not terse ops shorthand.
- Should feel like a letter from the kitchen, not a dashboard.

So the exploration inverts the palette (cream / paper / ink), softens every label,
and keeps only the three structural bones guests actually care about:

1. **Countdown** — when do we open?
2. **What we're preparing** — the 5 things happening behind the scenes, phrased for guests.
3. **A taste of the menu** — 6 category chips so they get a sense of what's coming.

Blockers, owner chips, task lists, phase chapters, and the full menu accordion are
**intentionally dropped**. Guests don't need to know we're waiting on a Thai FDA
inspection — they just need the vibe + the date.

## 1. Palette (inverted from owner variant)

| Token | Owner (dark) | Public (cream) | Role |
|---|---|---|---|
| `--s-0` | `#0A0D08` (warm black) | `#F5F0E3` (warm cream) | Page background |
| `--s-1` | `#10150D` | `#ECE4CD` | Panel / card |
| `--s-2` | `#171E12` | `#E4DAC0` | Elevated |
| `--ink` | `#F0EAD6` (cream text) | `#1F1A12` (ink brown-black) | Primary text |
| `--ink-dim` | `#D8D0B8` | `#5A4F3C` | Muted text |
| `--line` | `rgba(240,234,214,0.09)` | `rgba(31,26,18,0.10)` | Hairline dividers |
| `--amber-glow` | `#D6A03B` | `#B88830` (stepped down, contrast on cream) | Accent — countdown, seal |
| `--royal-red` | `#9B1C21` | `#9B1C21` (unchanged) | Wax seal |
| `--forest-soft` | `#5B7A3D` | `#5B7A3D` (unchanged) | Done / ready chip |

Noise overlay swapped from a dark-on-light grain to a paper-fibre grain (same SVG turbulence,
darker fill mapping). Keeps the "printed" feel.

## 2. Typography

Unchanged from owner variant. Same fonts reinforce brand identity across surfaces:

- Alegreya / Alegreya SC — display, overlines, marginalia
- DM Sans — body / UI
- JetBrains Mono — countdown digits, dates

Sizes scaled up slightly in the hero since there's less information density — the
countdown is the single focal point, not one of many panels.

## 3. Information architecture

```
TOPBAR                — Shishka icon + tagline "HEALTHY KITCHEN — OPENING IN BANGKOK"
HERO / COUNTDOWN      — "We open in 4 days" + opening-date line + soft lede
WHAT WE'RE PREPARING  — 5 soft-voice cards (customer-rephrased critical path)
A TASTE OF THE MENU   — 6 category chips with illustrative intro (no dishes listed)
TIMELINE              — simple horizontal ribbon from "today" to "doors open"
CTA                   — "Get notified when we open" email input + social links
FOOTER                — address, hours-to-be, ©
```

**Reading order rationale:** countdown first (that's the answer to the only question
guests showed up for), then the texture (what we're doing, what they'll eat), then
an emotional timeline, then a way to stay in touch.

## 4. Copy voice

The inversion of "ops voice → guest voice" is where most of the spec energy goes.
Paired examples:

| Owner variant | Public variant |
|---|---|
| "Before Recipe Lock" | "We open in 4 days" |
| "Everything that must be finished before Tuesday — the day the menu is frozen." | "A handful of quiet days between now and opening. Here is what we are preparing for you." |
| "Finalize manaeesh dough hydration · BAS · MC-0031 · DUE TODAY" | "Perfecting the manaeesh dough — each batch a little better than the last." |
| "Supplier: Makro produce confirmed · LESYA · MC-0028 · DUE SUN" | "Securing the ingredients we love from the growers we trust." |
| "Photo shoot Mon 28 Apr · LESYA · MC-0053" | "Capturing the plates you'll soon see on your table." |
| "Thai FDA inspection blocker" | *(omitted — not guest-facing information)* |
| "3/4 LOCKED" chip on Manaeesh | "Manaeesh · coming" |

No MC IDs. No owner chips. No status pills. No blockers panel. No phase numbers.
No dates beyond the opening date.

## 5. What's explicitly not in this variant

Keeping the exploration tight:

- **No live data** — this is a static marketing page, not a dashboard. Content is
  authored by hand (markdown → HTML). No Supabase, no `business_tasks`, no MC
  integration.
- **No persona switcher, no "My Line"** — irrelevant for guests.
- **No phase accordion / chapter drill-in** — guests don't need to know the phase model.
- **No blockers panel** — the whole concept is owner-only.
- **No task list** — replaced by the 5 soft-voice "what we're preparing" cards.

## 6. Tech sketch (only if we green-light a port)

**Out of scope for this task.** Exploration only. If approved:

- Framework: either Next.js (if shishka.health turns into a Next app) or a tiny
  static Astro/plain-HTML page — either works. No admin-panel stack required.
- Data: opening date + the 5 "what we're preparing" lines + category list — all as
  constants / a single content file. No DB.
- Email capture: whatever the rest of shishka.health uses for email (or a mailto
  fallback for v1).
- Deploy: whatever hosts shishka.health.

## 7. Open questions for designer / CEO review

1. **Opening date authority.** The dark variant has it as April 28 "Recipe Lock" —
   but that's not the restaurant opening, that's the menu freeze. What's the
   actual public opening date? Placeholder in the draft: "Opening · Spring 2026".
2. **Tone check on the 5 soft cards.** Copy is a first pass — does it sound like
   Shishka's voice (warm, a little old-world) or generic brand English? Designer
   pass before any port.
3. **How much menu to show.** Current draft: category names only. Alternative:
   3–4 "signature dish" teasers with plate illustrations.
4. **Is this the right URL?** `/opening`, `/soon`, `shishka.health` root? Depends
   on what's at the root today.

## 8. Sources

- Owner variant: `agents/designer/designs/roadmap-v1/SPEC.md` (design tokens borrowed)
- Brand tokens: repo `shishka-health` → `design-system/MASTER.md` (admin UI tokens: `agents/designer/admin-ui-tokens.md`)
- Design principles: `agents/designer/design-principles.md`
