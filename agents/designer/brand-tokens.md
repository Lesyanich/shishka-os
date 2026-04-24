# Brand Tokens — Shishka Healthy Kitchen

Source of truth для всех визуальных решений. Извлечено из логотипа (.ai), `apps/admin-panel/src/index.css`, SHISHKA BIBLE, 7X_Guidelines. Любой новый цвет/шрифт — сначала сюда, потом в код.

## Color System

### Primary (brand core)

| Token | Hex | Use |
|---|---|---|
| `--royal-green` | `#2D3F1C` | Primary brand — кнопки-CTA, логотип на светлом, heavy surfaces. Землистый, уверенный. |
| `--royal-red` | `#9B1C21` | Accent / alert. Stamps, warnings, "blocker", price tags, limited promos. |
| `--forest-soft` | `#5B7A3D` | Secondary green — progress, "in progress", hover на зелёном, tag fills. |
| `--brick-soft` | `#C74A4F` | Secondary red — soft warnings, badges, editorial accent. |
| `--amber-watch` | `#B88830` | Countdown, lock day, food-cost warning, gold highlight. |
| `--cream` | `#F0EAD6` | Primary light surface (menu, customer pages), text on dark, "paper". |

### Dark surfaces (admin-panel system)

| Token | Hex | Use |
|---|---|---|
| `--surface-1` | `#0B0F0A` | Page background (darkest). |
| `--surface-2` | `#12170F` | Cards, panels. |
| `--surface-3` | `#1A2114` | Hover / active elevated surfaces. |
| `--surface-line` | `#24301B` | Borders, dividers inside dark UI. |

### Nutrition / functional

| Token | Hex | Role |
|---|---|---|
| `--nutri-cal` | `#B88830` | Calories |
| `--nutri-pro` | `#6B7280` | Protein |
| `--nutri-car` | `#8B5A9E` | Carbs |
| `--nutri-fat` | `#B45A3C` | Fat |
| `--nutri-fib` | `#5B7A3D` | Fiber |

### Status semantic

| Token | Hex | Meaning |
|---|---|---|
| `--status-done` | `#5B7A3D` (forest-soft) | completed, green light, "good" |
| `--status-progress` | `#B88830` (amber) | in-flight, attention needed |
| `--status-blocked` | `#9B1C21` (royal-red) | stop, blocker, overdue |
| `--status-idle` | `#6B7280` | not started, neutral |

## Typography

### Font families

```
--font-display:    "Alegreya", ui-serif, Georgia, serif;
--font-display-sc: "Alegreya SC", ui-serif, Georgia, serif;
--font-sans:       "Geist", "DM Sans", system-ui, sans-serif;
--font-mono:       "JetBrains Mono", ui-monospace, monospace;
```

### Pairings (когда что использовать)

- **Alegreya (serif).** Editorial: заголовки меню, hero на customer-facing, заголовки разделов в roadmap, рецепты. Передаёт craft, книжность, traditional authority.
- **Alegreya SC (small caps).** Дисциплинированный supporting для section labels ("CHAPTER ONE", "PHASE 02"). Очень хорошо работает в UI над serif heading.
- **Geist / DM Sans.** Всё UI: buttons, table content, form labels, body под 18px.
- **JetBrains Mono.** Цифры (цены, food-cost %, bytes), коды задач (`MC-0042`), coordinates, countdown.

### Scale (roadmap page starting point)

| Role | Size | Weight | Font |
|---|---|---|---|
| Page title | 48–64 | 500 | Alegreya |
| Section (chapter) | 32–40 | 500 | Alegreya |
| Phase heading | 22–26 | 600 | Alegreya |
| Subtitle / overline | 11–12 | 600, uppercase, 0.12em tracking | Alegreya SC |
| UI body | 14–15 | 400 | Geist |
| Micro / meta | 11–12 | 500 | Geist |
| Numeric / code | 12–14 | 500 | JetBrains Mono |

## Spacing & Rhythm

Base unit: **4px**. Use multiples: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 / 96.

- Card padding: 24 (mobile) → 32 (desktop).
- Section gap: 48 (mobile) → 96 (desktop).
- Inline gap between metadata chips: 8.
- Line-height: 1.2 display, 1.5 body, 1.0 mono.

## Radii

- `--r-sm` 4 — chips, badges.
- `--r-md` 8 — inputs, small cards.
- `--r-lg` 12 — buttons, cards.
- `--r-xl` 20 — hero panels, modals.
- `--r-pill` 999 — status pills, toggles.

No `border-radius: 0` without reason — Shishka is warm, not techy.

## Shadows / Elevation

Dark mode — shadows are subtle glow, not cast:
```
--shadow-phase:    0 1px 0 rgba(240,234,214,0.04) inset, 0 12px 40px -12px rgba(0,0,0,0.45);
--shadow-focus:    0 0 0 1px rgba(184,136,48,0.6), 0 0 40px -8px rgba(184,136,48,0.35);
--shadow-blocker:  0 0 0 1px rgba(155,28,33,0.5),  0 0 40px -8px rgba(155,28,33,0.4);
```

Light (cream/paper) mode — physical stamp/ink feel:
```
--shadow-paper:    0 1px 0 rgba(45,63,28,0.05), 0 10px 30px -16px rgba(45,63,28,0.25);
--shadow-stamp:    0 2px 0 rgba(155,28,33,0.15);
```

## Motion

- Duration: 120ms (instant state), 220ms (state change), 420ms (entrance), 900ms (hero reveals).
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)` (default), `cubic-bezier(0.65, 0, 0.35, 1)` (emphatic).
- No bouncy springs unless celebratory (done/achievement).
- Prefers-reduced-motion: все >220ms анимации дизейблятся.

## Visual Motifs (brand signature)

Используй эти мотивы, чтобы макет сразу читался как Shishka, а не generic SaaS:

1. **Paper texture / craft.** Тонкий noise-texture на cream поверхностях. Намекает на кулинарный журнал, рецептурник, не digital flatness.
2. **Stamp / печать.** Круглые штампы из royal-red с засечным текстом — идеально для "IN PROGRESS", "LOCKED", "DONE". Чуть прокрашенные, чуть неровные. Как физический штамп шефа.
3. **Chapter markers.** Use Alegreya SC + decorative divider (— · —) для пауз между крупными блоками. Книжный ритм.
4. **Tick-marks / ruler.** Горизонтальные "линейки дней" с засечками — используем для timeline / countdown.
5. **Handwritten marginalia.** Короткие заметки курсивом (`font-style: italic`) как будто шеф от руки пометил. Используй для tone-setting, не для critical info.
6. **Spice/ingredient accents.** SVG-иллюстрации: оливковая ветвь, za'atar, pita, лимон — как мелкий брендинг в углах секций. Не доминируют.
7. **No purple/blue gradients.** Они ломают палитру. Аккуратно с gradient-ами вообще — природные, только внутри одного hue.

## Logo usage

- **Main logo (horizontal).** Use: hero, letterheads, email. Minimum width: 120px.
- **Icon (круглая печать).** Use: avatars, favicon, square containers.
- **Vertical logo.** Use: sidebars, stamps.
- **WG variant.** White/Gold version — для royal-green и darker surfaces.

Clear space: минимум = высота элемента "S" в логотипе вокруг всего бренд-марка.

## Tone of Voice (визуальный)

Если бы Shishka была человеком: шеф 38 лет, читает Джона Макфи и Massimo Bottura, слушает Fairouz и Nils Frahm, носит льняной фартук с пятнами оливкового масла, пишет рецепты в кожаный блокнот от руки, но пользуется iPhone. **Не** стартап-брат, **не** vegan influencer, **не** corporate wellness.

## Don't list

- ❌ Фиолетовые/синие градиенты.
- ❌ Generic "abstract waves", "floating orbs", "aurora" backgrounds.
- ❌ Emoji-as-icons в UI.
- ❌ Round avatars с initials на брендовом цвете (лучше реальные фото или monogram в cream).
- ❌ Comic Sans-adjacent handwritten fonts (используй настоящий italic serif).
- ❌ Tailwind stock palette (emerald-500, indigo-600) без mapping на brand tokens.
