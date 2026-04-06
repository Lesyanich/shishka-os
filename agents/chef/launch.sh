#!/bin/bash
# =============================================================
# Chef Agent — Terminal Launch Script
# Run from anywhere: bash agents/chef/launch.sh
# =============================================================

set -e

# Navigate to repo root (where .mcp.json lives)
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Model: opus for R&D/complex tasks, sonnet for routine work
MODEL="${CHEF_MODEL:-sonnet}"

# Launch Claude Code with:
#   --append-system-prompt-file: chef personality + rules (compact, ~2K tokens)
#   --allowedTools: auto-approve chef + MC reads without prompting
#   Initial prompt: triggers context loading (reads memory files, checks DB)
claude \
  --model "$MODEL" \
  --append-system-prompt-file agents/chef/cowork-project-instructions.md \
  --allowedTools \
    "mcp__shishka-chef__search_products" \
    "mcp__shishka-chef__get_bom_tree" \
    "mcp__shishka-chef__calculate_cost" \
    "mcp__shishka-chef__calculate_nutrition" \
    "mcp__shishka-chef__suggest_price" \
    "mcp__shishka-chef__validate_bom" \
    "mcp__shishka-chef__audit_all_dishes" \
    "mcp__shishka-chef__check_inventory" \
    "mcp__shishka-chef__list_equipment" \
    "mcp__shishka-chef__search_knowledge" \
    "mcp__shishka-chef__manage_recipe_flow" \
    "mcp__shishka-mission-control__list_tasks" \
    "mcp__shishka-mission-control__get_task" \
    "mcp__shishka-mission-control__emit_business_task" \
    "mcp__shishka-mission-control__update_task" \
    "Read" \
    "Edit" \
    "Glob" \
    "Grep" \
  "$(cat agents/chef/first-prompt.md)"
