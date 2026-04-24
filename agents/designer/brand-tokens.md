# Brand Tokens — Shishka Admin Panel (v1.3 prototype snippet)

Authoritative source for the warmer-dark surface palette and motion easing adopted
by the admin panel. Full reference lands via task `7710fe5a` port PR; this snippet
is the spec consumed by task `deab9ec5` (token promotion into `@theme`).

When the full `brand-tokens.md` arrives, reconcile any drift against this snippet.

## Color System (dark surfaces)

```
--s-0: #0A0D08    /* page */
--s-1: #10150D    /* panel */
--s-2: #171E12    /* elevated */
--s-3: #1F2818    /* hover */
--line:        rgba(240, 234, 214, 0.09)
--line-strong: rgba(240, 234, 214, 0.18)
```

## Semantic

```
--brick-bright: #E27A7F  /* AA-safe red, 6.82:1 on --s-0 */
```

## Motion

```
--e-out:  cubic-bezier(0.2, 0.8, 0.2, 1)   /* default UI transition */
--e-emph: cubic-bezier(0.65, 0, 0.35, 1)   /* emphatic / entrance / celebration */
```

## Consumption

Tokens live in `apps/admin-panel/src/index.css` `@theme` block and are consumed
via `var(--s-N)` / `var(--line)` / `var(--e-out)` etc. in CSS and inline styles.
Additive to the existing `--color-surface-*` set — do not migrate existing
callsites without a planned visual audit (see follow-up migration task).
