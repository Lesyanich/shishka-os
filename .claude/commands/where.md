> **Repo root:** `/Users/lesianich/code/shishka` — every path below is relative to it.
> This command must work from any directory, including the `shishka-health` site repo.

The CEO is asking **which repository a task belongs to**. Answer in Russian, in two or three
sentences. Do not open files unless the answer genuinely depends on their contents.

## The rule

> **Кто пишет в базу — тот `shishka-os`. Кто только показывает гостю — тот `shishka-health`.**
> Сомневаешься → `shishka-os`. Новое поле всегда рождается в `shishka-os` (миграция)
> и только потом появляется в `shishka-health` (отрисовка).

Two repos, one Supabase project (`qcqgtcsjoacuktcewpvo`):

| | `shishka-os` (`~/code/shishka`) | `shishka-health` (`~/code/shishka-health`) |
|---|---|---|
| Role | everything that **writes** | **reads only** |
| Holds | migrations, admin panel, KDS, MCP services, agents | public menu at shishka.health, brand design system |
| Deploy | Vercel project `shishka-os` (admin) | Vercel project `shishka-web` |

## How to answer

1. **Does the task change data or the shape of data?** → `shishka-os`.
2. **Does it only change what the guest sees on shishka.health?** → `shishka-health`.
3. **Neither** — if it is editing *content* (a price, a photo, a dish description, site copy in
   `site_content`), the answer is **no repository at all**: the admin panel or `/chef`. Say so
   explicitly, because this is the most common case and opening a repo for it is wasted work.
4. **Both** — if the site needs a field that does not exist yet, the answer is **`shishka-os`
   first, `shishka-health` second**. Give the ordering, not just the repos; the ordering is the
   part that breaks in practice.

## Worked answers

| Задача | Ответ |
|---|---|
| Поменять цену блюда, фото, состав | Ни один репо — админка или `/chef` |
| Добавить аллергены на сайт | Сначала `shishka-os` (миграция + контракт), потом `shishka-health` |
| Перекрасить кнопку, поправить текст-заглушку, вёрстка | `shishka-health` |
| Перекрасить что-то в админке | `shishka-os` |
| Позвать `/chef`, `/finance`, `/procurement`, `/strategy` | `shishka-os` — команда живёт только там |
| Поменять RLS, вью, миграцию | `shishka-os` + обязательно проверить контракт меню |
| Новый агент, новый MCP-инструмент | `shishka-os` |
| Дизайн-система, бренд-цвета, шрифты | `shishka-health` (`design-system/MASTER.md`) |
| Токены поверхностей админки | `shishka-os` (`agents/designer/admin-ui-tokens.md`) |

## The trap worth naming

`menu_public`, `site_content`, `menu_modifiers`, `price_tiers` are the **contract** between the
two repos. A migration in `shishka-os` that touches them breaks the live site, and the site fails
by quietly showing stale prices rather than erroring. If the task touches any of them, say so and
point at `contracts/menu-contract.json` in the `shishka-health` repo.

If the CEO gave no task text, ask what she is trying to do — one short question, then answer.
