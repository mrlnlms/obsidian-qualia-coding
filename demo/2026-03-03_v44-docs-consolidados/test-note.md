---
version: 44
date: 2026-03-03
type: consolidation
---

# v44 — Docs Consolidados

## What's new

Documentation consolidation: 18 scattered docs (per-engine CLAUDE.md, MERGE-PLAN, APPROACH2/3, SOURCE-FILES, CROSS-ENGINE, BACKLOG, worklogs) replaced with 6 organized documents:

- **ARCHITECTURE.md** — design decisions and "why" reasoning
- **ROADMAP.md** — 20 planned features by priority (absorbs BACKLOG.md)
- **TECHNICAL-PATTERNS.md** — CM6, Fabric.js, AG Grid, WaveSurfer, PDF gotchas
- **DEVELOPMENT.md** — onboarding, porting playbook, components, testing
- **HISTORY.md** — v2 through consolidation (2026)
- **PREHISTORY.md** — origin story: Notion to prototypes to v1 (2023-2025)

## How to verify

1. Open the `docs/` folder in the vault — should contain exactly 6 `.md` files
2. No `BACKLOG.md` at root
3. Console: `[Qualia Coding] v44 loaded`
4. All engines still work — no code changes in this version
