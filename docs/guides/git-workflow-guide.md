# Git Workflow Guide — for the CEO (working through Claude)

> Audience: Lesia (CEO) and any non-engineer who directs Claude to write code but
> does not type git commands themselves. Goal: understand what git is doing well
> enough to **read** what Claude reports, **decide** correctly, and **keep the
> history clean**. Built from an audit of this repo's real history (through PR #501).
>
> Language: this doc is stored in English per the Language Contract. Talk to Claude
> in Russian — this is the reference you return to.

---

## 0. The one-paragraph mental model

Think of `main` as the **official published recipe book** — the single source of
truth everyone cooks from. You never scribble in the official book directly.
Instead you take a **photocopy of a few pages** (a *branch*), work out a new recipe
on it, and each time a page is finalized you staple a note to it (a *commit*).
When the new recipe is ready and tested, you formally **propose adding your pages
to the official book** (a *Pull Request*); once approved, the pages are bound in
(*merge*). *Pull* = get the latest official book onto your desk. *Revert* = tear a
bad page back out with a visible "removed because…" note.

That's the whole thing. Everything below is detail.

---

## 1. The five words, precisely

| Word | What it really is | Recipe-book metaphor |
|---|---|---|
| **Commit** | A saved snapshot of the files at one moment, with a message. Permanent, has a unique id (e.g. `4ee33ec`). | A finalized page with a caption ("added salt, 10 min"). |
| **Branch** | A movable label pointing at a line of commits. Lets you work without touching `main`. | A photocopy of some pages you scribble on. |
| **`main`** | The trunk branch — the live, source-of-truth version. Deploys ship from here. | The official published book. |
| **Push / Pull** | Push = upload your local commits to GitHub. Pull = download the latest from GitHub. | Send your pages to the shared shelf / fetch the latest shelf copy. |
| **Merge** | Combine a branch's commits into another branch (usually into `main`). | Bind your new pages into the official book. |
| **Pull Request (PR)** | A *proposal* on GitHub: "merge my branch into `main`", with a diff, review, and CI checks. | A formal request to the editor to add your pages, with a checklist. |
| **Revert** | A **new** commit that undoes a previous one. History is never erased — the undo is recorded. | Tear out a page and staple a "removed, it was wrong" note in its place. |

Two things people trip on:

- A **commit is not a save-to-cloud.** Committing is local. Nothing is on GitHub
  until you **push**. ("I committed" ≠ "it's safe on GitHub.")
- A **branch is cheap and disposable.** It's just a label. Making one costs nothing;
  deleting a merged one loses nothing (the commits live on in `main`).

---

## 2. The lifecycle — what happens on every task

```
main (official book)
  │
  │  1. Claude branches off main       →  feature/admin/schedule-hide-owners
  ▼
feature/…                 2. commits    →  feat(schedule): hide owners …
  │  ●───●───●                              (each ● = one saved page)
  │                       3. push        →  branch now on GitHub
  │                       4. open PR      →  diff + CI checks + your review
  │                       5. VERIFY       →  build passes, you saw it work
  ▼
main  ●───────────────●   6. merge       →  pages bound into the official book
                          7. delete branch (the photocopy is done with)
                          8. deploy ships from main
```

Steps **5** (verify) and **7** (delete) are the ones most often skipped, and both
show up as mess in this repo's history (see §3).

---

## 3. The actual mess in THIS repo (audit findings + fix for each)

These are not hypothetical — each is drawn from the real git history.

### Finding 1 — Branch names are half-clean, half-noise ⚠️ biggest source of "грязь"

The last ~90 branches split into two camps:

- **55 clean, self-describing** — `feature/admin/schedule-hide-owners`,
  `feature/security/service-role-fn-guards`. You can read the branch list and know
  exactly what each is.
- **32 random-generated** — `claude/funny-spence-8f1168`,
  `claude/modest-dhawan-c424e7`, `claude/zealous-cerf-ac49b9`. These tell you
  **nothing**. This is the clutter you feel.

**Root cause:** when a session starts without being told a branch name, Claude Code
auto-generates a throwaway one (`claude/<random-words>-<hash>`). Left alone, it sticks.

**Fix (one sentence, at task start):**
> "Работай в ветке `feature/{проект}/{короткое-описание}` — например
> `feature/admin/schedule-fix`. Не оставляй `claude/*`-имя."

Convention (already in `technical-rules.md` § Git Workflow):
`feature/{project}/{description}` where project ∈ `admin | web | app | agents |
security | tooling | docs | cleanup`.

### Finding 2 — Merge-then-revert: shipping before verifying 🔴 highest cost

Real incident: **PR #493** (`claude/funny-spence-8f1168`, the Shishka Slice game +
menu changes) was **merged at 12:03** and **reverted at 13:39 the same day**
(commit `a8bf419`). The same day, a parallel session pushed `apps/web` onto the
**live site** by mistake and shishka.health had to be restored from an older deploy
(see `deploy-map.md` post-mortem).

**Root cause:** merge happened before anyone confirmed the change actually worked in
the real app. A revert is expensive: it pollutes history, and reverting a *merge*
commit is fiddly and can block the branch from being re-merged cleanly later.

**Fix — the VERIFY gate before every merge:**
> "Перед мерджем: собери проект, прогони проверки и **покажи мне, что это реально
> работает** (скрин / вывод), а не только 'тесты зелёные'. Мержим только после этого."

This is the project's own **VERIFY-BEFORE-DONE** principle. For anything touching the
live site, the extra rule is: agents never `vercel deploy` — prod ships only via git
(`deploy-map.md`).

### Finding 3 — Some PRs are too big to review or revert safely 🟠

Several PRs touch **14+ files at once** (e.g. `761da83`: 14 files, +398/−190;
`d6a719e`: 14 files). Big PRs are hard for you to review, hard for CI to isolate a
failure, and — as #493 showed — messy to revert as one lump.

**Fix — scope discipline:**
> "Держи PR маленьким и про одно. Если задача разрослась — разбей на несколько
> веток/PR, а не сваливай всё в один."

Rule of thumb: a PR you can't skim in a couple of minutes is a PR that's hiding risk.
One PR = one intent.

### Finding 4 — Mixed merge strategy makes history noisy 🟡

The history mixes two styles: **merge commits** (`Merge pull request #500 from …`,
which create the little "bubbles" in the graph) and **squash merges** (a single tidy
line ending in `(#490)`). Inconsistency is what makes the log hard to read.

**Fix — pick one and stick to it.** For this repo the cleaner default is **squash on
merge**: each PR collapses to exactly one commit on `main`, so `main`'s history reads
as one clean line of "one feature = one commit". Set it once in GitHub → Settings →
"Allow squash merging" as the default, or just tell Claude:
> "Мержи через squash — один PR = один коммит в main."

(Merge-commit style is fine too — the point is *consistency*, not which one.)

### Finding 5 — Parallel sessions collide 🟡

Branch names like `claude/site-recovery-parallel-session-…`, the claim-gate hook, and
the same-day deploy incident all point to **multiple Claude sessions running at once**
and occasionally stepping on each other.

**Fix — one lane at a time, or explicit lanes:**
- Prefer finishing (merge + delete branch) before starting a parallel session on the
  same area.
- If you *do* run parallel sessions, give each a **distinct branch and distinct files**
  and say so: "эта сессия трогает только `/schedule`, ничего больше."
- The claim-gate (a task can be owned by only one session) already exists to protect
  MC tasks — respect the "OWNED BY ANOTHER SESSION" warning.

---

## 4. What this repo already does RIGHT (keep doing it)

The audit found genuinely good hygiene — don't lose it:

- **Commit messages are excellent.** Consistent Conventional Commits:
  `feat(schedule):`, `fix(menu):`, `docs(ops):`, `perf(admin):`, `security(rls):`.
  This is above-average discipline. Keep the `type(scope): summary` shape.
- **Merged branches get deleted.** The remote is clean (2 branches, not 90 stale ones).
- **Almost everything goes through a PR** with CI checks — not raw pushes to `main`.
- **A commit gate exists** (`RULE-COMMIT-GATE`): docs + MC task synced before push.

So the problem isn't discipline in general — it's three specific leaks: **branch
names, the verify-before-merge gate, and PR size.** Fix those three and the "грязь"
mostly disappears.

---

## 5. Cheat sheet — phrases to tell Claude (copy/paste)

| You want… | Say this (Russian is fine) |
|---|---|
| Start work cleanly | «Заведи ветку `feature/{проект}/{описание}`, не `claude/*`. Покажи имя, прежде чем начать.» |
| Before merging | «Собери, проверь, **покажи что работает**. Мержим только после этого.» |
| Keep PRs small | «Один PR = одно изменение. Разрослось — разбей.» |
| Consistent history | «Мержи через squash — один PR = один коммит в main.» |
| Undo a bad merge | «Откати PR #NNN через `git revert` и объясни, что сломалось.» |
| See the state | «Покажи `git status`, текущую ветку и `git log --oneline -10` простыми словами.» |
| Clean up | «Удали слитые ветки, покажи, какие остались и зачем.» |
| Parallel work | «Эта сессия трогает только <папку>. Отдельная ветка, ничего больше не трогай.» |

---

## 6. Small decision guides

**When does new work need a new branch?**
Almost always. Any change bigger than a one-line typo → its own `feature/*` branch.
Never work directly on `main`.

**Squash vs merge commit?**
Squash (recommended here) = one clean commit per PR on `main`, tidy log, trivial to
revert. Merge commit = keeps every intermediate commit + adds a "bubble". Pick one
project-wide. Consistency beats the specific choice.

**When to revert vs fix-forward?**
- Broke the live site / broke `main` for everyone → **revert now**, investigate after.
- Small, contained bug you understand → **fix-forward** (a new small PR) is cleaner
  than a revert.

**Merge conflict — what is it?**
Two branches changed the *same lines*, so git can't auto-combine and asks a human to
choose. It's normal, not a disaster. Tell Claude: «реши конфликт, покажи, какие куски
ты выбрал и почему» — and review that summary.

---

## 7. How to READ what Claude tells you

- **`git status`** → "what's changed but not yet saved/pushed." Empty = clean.
- **`git log --oneline`** → the list of finalized pages, newest first. Each line =
  one commit (`4ee33ec feat(schedule): …`).
- **A diff (`+`/`−` lines)** → exactly what changed: green added, red removed. This is
  what a PR shows and what you approve.
- **CI checks on a PR** → automated tests. **All green before merge**, no exceptions
  (this is what would have caught #493).
- **"ahead/behind"** → your branch has commits GitHub doesn't (ahead → needs push), or
  GitHub has commits you don't (behind → needs pull).

If Claude reports something you don't follow, the right move is one sentence:
«объясни это простым языком и что мне решить.»

---

## 8. Glossary (fast)

- **Repository (repo)** — the whole project + its full history.
- **Commit** — one saved snapshot + message. Local until pushed.
- **Branch** — a movable pointer / a line of work off `main`.
- **`main`** — the trunk; the live source of truth.
- **HEAD** — "where you are right now" (which commit/branch is checked out).
- **Push / Pull** — upload / download commits to & from GitHub.
- **Fetch** — download GitHub's state *without* merging it into yours (a look-first pull).
- **PR (Pull Request)** — a proposal to merge a branch, with review + CI.
- **Merge** — combine branches.
- **Squash** — collapse a branch's commits into one before merging.
- **Rebase** — replay your commits on top of a newer base (advanced; leave it to Claude).
- **Revert** — a new commit that undoes an old one; history stays intact.
- **Conflict** — two changes to the same lines; a human picks.
- **Origin** — the GitHub copy (as opposed to your local copy).

---

## 9. The 20% that prevents 80% of the mess

1. **Every change gets a readable `feature/{project}/{desc}` branch** — never leave a
   `claude/*` name. *(fixes Finding 1)*
2. **Nothing merges until you've seen it actually work** — build + verify, not just
   "tests pass". *(fixes Finding 2 — the revert)*
3. **One PR = one intent, kept small.** *(fixes Finding 3)*
4. **Squash-merge for a clean, one-line-per-feature `main`.** *(fixes Finding 4)*
5. **One lane at a time; parallel sessions get separate branches + files.**
   *(fixes Finding 5)*

Do these five and your history stays clean without you ever typing a git command.

---

## 10. How this is now enforced (so you don't police it by hand)

This guide is backed by **three layers** so the rules self-enforce (`RULE-GIT-HYGIENE`):

| Layer | What it is | Who it stops |
|---|---|---|
| **1. Rule** | This guide + `technical-rules.md` § RULE-GIT-HYGIENE | Claude reads it |
| **2. Local hook** | `.claude/hooks/git-guard-pretool.sh` — **hard-blocks** any commit/push to `main`, **warns** on off-convention branch names | any Claude session in the terminal |
| **3. GitHub settings** | branch protection, squash-only, required CI, auto-delete branches | **everyone** — can't be bypassed by a prompt |

Layer 2 already ships in this repo. Layer 3 is the strongest and only **you** can
switch it on (the agent proxy blocks settings writes). It's a 2-minute one-time job:

### ✅ GitHub settings checklist (do once)

Open **github.com/Lesyanich/shishka-os → Settings**, then:

1. **General → "Pull Requests"**
   - ✅ **Allow squash merging** — and set it as the default; uncheck "Allow merge
     commits" so history stays one-line-per-PR.
   - ✅ **Automatically delete head branches** — kills the merged-but-undeleted clutter forever.
2. **Branches → Add branch ruleset (or protect `main`)** — target `main`:
   - ✅ **Require a pull request before merging** (blocks direct pushes to `main`).
   - ✅ **Require status checks to pass** — pick the CI check (Vercel / build). This is
     what would have caught the PR #493 break before merge.
   - ✅ (optional) **Require branches to be up to date before merging.**

Once these are on, direct-to-`main` and branch clutter become **structurally
impossible**, not just discouraged — for you, me, and any parallel session.

> Escape hatch for automation: sanctioned jobs that must write to `main` (e.g. the
> data-health sheriff) run with `SHISHKA_ALLOW_MAIN=1`. Never use it by hand.
> On-demand clutter snapshot: `sh scripts/git-hygiene-report.sh`.

---

*Related rules: `technical-rules.md` § RULE-GIT-HYGIENE, § RULE-COMMIT-GATE,
§ RULE-DEPLOY-MAP · `operational-rules.md` § Git State Protocol · core principle
VERIFY-BEFORE-DONE.*
