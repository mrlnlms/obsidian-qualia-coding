---
version: 29
date: 2026-02-19
type: docs-only
---

# v29 — ARCHITECTURE.md Roadmap Update

## What changed

This version updates the internal ARCHITECTURE.md roadmap document in the codemarker-v2 source repo. The changes reflect planning decisions for the multi-engine architecture — CSV, PDF, Image, Audio, Video, and Analytics engines.

No code changes were made. The updated files (ARCHITECTURE.md, CLAUDE.md) are dev-only documents excluded from the porting rsync, so this commit records the documentation activity as a dated folder in the demo vault.

## Context

- The CSV engine (v28) was already live in the demo vault
- This roadmap update happened between engine appearances, documenting the architectural vision for upcoming engines
- Source commit: 938f193 in codemarker-v2

## How to verify

1. Confirm this folder exists in the demo vault: `2026-02-19_v29-architecture-roadmap-update/`
2. No plugin changes — all engines and main plugin should work exactly as before
