# QDPX Import Test Coverage Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a sample QDPX with hierarchy/magnitude/relations and test import round-trip (unit + e2e).

**Architecture:** Unit test generates QDPX in-memory via fflate, runs parsers, verifies all fields. E2e test calls importQdpx via plugin API on a pre-generated QDPX file in test vault.

**Tech Stack:** fflate (ZIP), Vitest, wdio + obsidian-e2e-visual-test-kit

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `tests/import/qdpxRoundTrip.test.ts` | Generate QDPX in-memory, parse+verify all sections |
| Create | `scripts/generate-test-qdpx.ts` | Node script: generate sample .qdpx for e2e vault |
| Create | `test/e2e/vaults/visual/sample-import.qdpx` | Pre-generated QDPX fixture |
| Create | `test/e2e/specs/import-qdpx.e2e.ts` | E2e: import QDPX via plugin API, verify markers |

---

## Task 1: Unit round-trip test

**Files:**
- Create: `tests/import/qdpxRoundTrip.test.ts`

The test builds a QDPX XML string with all features, wraps it in a ZIP, then parses it and verifies every field.

---

## Task 2: QDPX generator script + e2e test

**Files:**
- Create: `scripts/generate-test-qdpx.ts`
- Create: `test/e2e/vaults/visual/sample-import.qdpx`
- Create: `test/e2e/specs/import-qdpx.e2e.ts`
