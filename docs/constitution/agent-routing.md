# Agent Routing — Dispatcher Protocol

> This file is loaded when an agent needs to determine its role.
> If the MC task already specifies a domain and the agent knows its AGENT.md — skip this file.

---

## Slash Commands

| Command | Agent | What it loads |
|---------|-------|--------------|
| `/chef` | Chef Agent | `agents/chef/AGENT.md` + kitchen MCP tools + MC tasks (domain=kitchen) |
| `/finance` | Finance Agent | `agents/finance/AGENT.md` + finance MCP tools + receipt inbox |
| `/coo` | Auto-router | Classifies message (tech vs strategic) and loads `/strategy` or `/techlead` — see `docs/plans/spec-agents-split.md` §3.1 |
| `/strategy` | Strategic COO | `agents/strategy/AGENT.md` + `core-rules.md` + `agent-rules.md` + `DISPATCH_RULES.md` |
| `/techlead` | Technical Tech-Lead | `agents/tech-lead/AGENT.md` + `core-rules.md` + `agent-rules.md` + `engineering-rules.md` + `docs/operations/skills-services-policy.md` |

---

## Free Text Routing (model inference)

When the user sends free text without a slash command, **infer the domain from content**.
Do NOT rely on keyword matching — use your understanding of the message.

Guidelines:

- Receipt, invoice, expense, supplier, cost → **finance** → load `/finance`
- Dish, menu, BOM, recipe, ingredient, nutrition → **kitchen** → load `/chef`
- PR, bug, deploy, commit, migration, CI, code → **tech** → load `/techlead`
- Roadmap, priority, strategy, initiative, business idea → **strategy** → load `/strategy`
- Inbox triage, sprint, task coordination → **tech** (hygiene is Tech-Lead's job); priority re-ranking → **strategy**

**When unsure:** ask the user: "This sounds like [domain]. Should I load [agent]?"
This is better than guessing wrong and loading the wrong context.

---

## COO Split (2026-04-08)

The monolithic COO has been split into Strategic COO and Technical Tech-Lead per `docs/plans/spec-agents-split.md`. `/coo` is now a thin auto-router. `agents/coo/AGENT.md` is a deprecation stub — do not load it directly.

---

## After Routing

Once the agent role is determined:
1. Load the agent's `AGENT.md`
2. Check MC tasks for that domain: `list_tasks(domain="{domain}")`
3. Report status to user
4. Ask what to do (or pick up an in-progress task)
