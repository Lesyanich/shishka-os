---
title: Brand Visual System
type: page
tags: [brand, design, tokens]
date: 2026-04-29
status: active
related:
  - "[[Brand/]]"
  - "[[Tech/Stack]]"
---

# Brand Visual System

The token vocabulary the admin panel and any future Shishka surface (web, mobile, signage in print) consume. Source: [`agents/designer/brand-tokens.md`](../../agents/designer/brand-tokens.md), [`docs/branding/assets-index.md`](../../docs/branding/assets-index.md), and the live `@theme` block in `apps/admin-panel/src/index.css`.

## Color — dark surfaces (warm-grey palette)

The admin panel is **dark-only by design**. The palette is warm-grey (not slate-blue) to feel grounded and food-forward, not techy.

```css
--s-0: #0A0D08    /* page */
--s-1: #10150D    /* panel */
--s-2: #171E12    /* elevated */
--s-3: #1F2818    /* hover */
--line:        rgba(240, 234, 214, 0.09)
--line-strong: rgba(240, 234, 214, 0.18)
```

### Semantic accents

```css
--brick-bright: #E27A7F   /* AA-safe red, 6.82:1 contrast on --s-0 */
```

Plus the existing Tailwind palette (rose, fuchsia, amber, emerald, sky) used for category tags and status indicators across the admin.

## Motion easing

```css
--e-out:  cubic-bezier(0.2, 0.8, 0.2, 1)    /* default UI transition */
--e-emph: cubic-bezier(0.65, 0, 0.35, 1)    /* emphatic / entrance / celebration */
```

Use `--e-out` for everything except moments designed to draw attention (toast appear, success states, confetti) — those use `--e-emph`.

## How tokens are consumed

Tokens live in the `@theme` block of `apps/admin-panel/src/index.css` and are referenced via `var(--s-N)` / `var(--line)` / `var(--e-out)` in CSS and inline styles.

**Migration note:** these tokens are *additive* to the existing `--color-surface-*` set. Do not migrate existing call-sites without a planned visual audit (see `vault/Milestones/2026-04-24-warmer-dark-tokens.md` style follow-up).

## Logo system

Five master variants live on Drive (see [[Brand/]] for full path table):

| Use | Variant |
|---|---|
| Web / print, light bg | `Shishka-Kitchen-Logo-24-12-25.png` (horizontal) |
| Web / print, dark bg | `Shishka-Kitchen-Logo-WG-24-12-25.jpg` (white-on-warm-grey) |
| Vertical layouts (signage, packaging) | `Shishka-Kitchen-Logo-VIRTICAL-24-12-25.png` |
| Icon / favicon | `Shishka-Kitchen-Logo-Icone-WG-24-12-25.png` |
| Editable source (any new derivative) | `Shishka Kitchen Logo 24-12-25.ai` |

The `apps/admin-panel/src/assets/shishka-logo.png` is the only logo bundled into the web app. Hand-copied; no automated sync.

## Brand bible

The `SHISHKA BIBLE – The Future of Food 34.pdf` lives in `Drive: 01_Business/Branding/SHISHKA BIBLE/`. It is the master deck — positioning, photography style, signboard mockups, packaging. Reference for any large design exercise; do not duplicate its content in vault (vault links to it).

## Photography style (TBD via R&D)

Reference imagery in the brand bible. Working principle:

- Top-down or 30° angle, never artistic side-profile
- Natural daylight or daylight-balanced LED
- Minimal styling — the food is the hero, not the surrounding props
- Color: warm earth tones in the surface; food brings the saturation
- No filters that shift hue (tomato red must be tomato red)

When you ship new product photography, store originals in `Drive: 01_Business/Branding/` and reference them via `assets:` frontmatter on the relevant [[Menu/]] or product page.

## See Also

- [`agents/designer/brand-tokens.md`](../../agents/designer/brand-tokens.md) — the source spec
- [`apps/admin-panel/src/index.css`](../../apps/admin-panel/src/index.css) — the live `@theme` consumption
- [[Tech/Stack]] — Tailwind v4 / React 19 / Vite 7 stack the system targets
- [[Brand/Identity]] — what these tokens visually communicate
