---
version: 30
date: 2026-02-20
type: docs-only
---

# v30 — Analytics ViewModes Documentation

## What changed

This version captures 4 commits (076f47b to a959d4c) in the codemarker-v2 source repo where CLAUDE.md was updated to document the Analytics engine's ViewModes growing from 11 to 17 modes. The documentation expanded to cover the newly added visualization types: Polar, Chi-squared, Decision Tree, Source Comparison, Code Overlap, and Research Board.

No code changes were made. CLAUDE.md is a dev-only document excluded from the porting rsync, so this commit records the documentation activity as a dated folder in the demo vault.

## Context

- The Analytics engine (v38) was already live in the demo vault with all 18 view modes + Research Board
- These CLAUDE.md updates happened between engine appearances, documenting the full analytics capability as it grew from 11 to 17 ViewModes
- Source: 4 commits 076f47b to a959d4c in codemarker-v2

## How to verify

1. Confirm this folder exists in the demo vault: `2026-02-20_v30-analytics-viewmodes-docs/`
2. No plugin changes — all engines and main plugin should work exactly as before
