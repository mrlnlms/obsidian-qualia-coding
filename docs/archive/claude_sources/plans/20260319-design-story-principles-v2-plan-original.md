# Plan: Design Principles Document (Reverse-Engineered)

## Context

Qualia Coding has sophisticated UX decisions encoded in 28K LOC across 7 engines — but NO document captures the design philosophy. The developer invested significant effort in Obsidian-native UX, MAXQDA-inspired visuals, and researcher-centric interactions, but this work is invisible in the existing documentation (CLAUDE.md covers architecture, TECHNICAL-PATTERNS.md covers gotchas, DEVELOPMENT.md covers onboarding — none cover WHY the design choices were made).

This matters for: community plugin listing (reviewers evaluate UX), README/marketing ("MAXQDA-style margin bars" is a feature — the principle behind it is a differentiator), the methods paper (design principles grounded in theory are the argument), and future contributors (without documented principles, new features break visual coherence).

## Status

**v1 concluída:** `docs/pm/product/DESIGN-PRINCIPLES.md` (562 LOC, 7 seções, evidência por princípio)
**v2 spec aprovado:** `docs/superpowers/specs/2026-03-19-design-story-and-principles-v2-design.md`
**Deliverables:** DESIGN-STORY.md (novo, case study) + DESIGN-PRINCIPLES.md (v2, patches na v1)

## What Was Created (v1)

**File:** `docs/pm/product/DESIGN-PRINCIPLES.md`

Reverse-engineered design principles document capturing the implicit philosophy embedded in the codebase. Evidence traces to specific files and patterns.

## Structure

### 1. Design Philosophy Statement
- "Coding as thinking" — UX should support interpretation, not manage data
- Researcher focus: never interrupt, always echo attention
- Obsidian-native: follow the platform, extend deliberately

### 2. Core Principles (8-10, each with evidence from code)

| Principle | Code Evidence | User Impact |
|-----------|--------------|-------------|
| **Respect researcher focus** | Never auto-revealLeaf, custom events only on user action | No focus stealing during analysis |
| **Visual information density** | Margin bars with weighted collision avoidance, vertical audio lanes | See coding density at a glance without scrolling |
| **Explicit over implicit** | applyThemeColors() copies CSS vars inline, never relies on cascade | Works in every theme, dark and light |
| **Unified but modular** | SidebarModelInterface + UnifiedModelAdapter | One sidebar for 7 engines, consistent UX |
| **Graceful state management** | Phantom marker prevention, deferred deletion, keepIfEmpty | No orphaned data from cancelled operations |
| **Smooth transitions** | 400ms hover open, 300ms grace period, 30ms debounce | UI feels responsive but not twitchy |
| **Settings are opinionated** | 12 exposed settings, many hardcoded by design | Workflow choices = user, visual design = developer |
| **Bidirectional feedback** | setHoverState across all engines | Hover in text → sidebar glows, and vice versa |
| **Semantic layering** | Z-index choreography (text < highlight < draw < annotation) | Layers encode meaning, not just stacking |
| **Discovery through UI** | Context menus + toolbars, minimal command palette | Self-documenting interface |

### 3. Visual Design System
- Color strategy: CSS variables + applyThemeColors() for non-DOM contexts
- Opacity blending: mix-blend-mode multiply, 0.35 base / 0.55 hover
- Namespacing: per-engine prefixes, never rename to qc-*
- Margin panel: column allocation (larger→inner), label weight collision avoidance

### 4. Interaction Patterns
- Two-mode menu (selection vs hover) with different code suggestion logic
- Hover grace period (400ms open / 300ms close / 30ms debounce)
- Batched CM6 effects (never dispatch inside Tooltip.create)
- File interception strategy (registerExtensions only for CSV, active-leaf-change for rest)

### 5. Cross-Engine Consistency
- SidebarModelInterface contract (12 methods)
- Navigation events: `qualia-{engine}:navigate`
- CodingPopoverAdapter interface
- Type guards for polymorphism: isPdfMarker(), isAudioMarker(), etc.

### 6. Design History (from HISTORY.md)
- The 3 Menu Approaches journey (A → B → C) and what each taught
- The "Dark Mode Breakthrough" (CSS vars → inline styles)
- The consolidation decision (7 plugins → 1) and its UX implications
- Frozen version v0-pre-overlay: why Decoration.widget was abandoned for scrollDOM overlay

### 7. Anti-Patterns (What We Don't Do)
- Never auto-reveal on updates
- Never dispatch effects inside Tooltip.create()
- Never call loadData/saveData directly (always DataManager)
- Never use registerExtensions for native file types
- Never rename CSS prefixes for consistency (backward compat > aesthetics)

## Key Source Files to Reference

- `src/core/codingPopover.ts` — unified menu, two-mode logic
- `src/core/baseCodingMenu.ts` — theme color copying, menu primitives
- `src/markdown/cm6/marginPanelExtension.ts` — collision avoidance algorithm
- `src/markdown/cm6/markerViewPlugin.ts` — hover coordination, handle design
- `src/pdf/highlightRenderer.ts` — opacity blending, z-index layers
- `src/media/waveformRenderer.ts` — shadow DOM workaround, theme sync
- `src/media/regionRenderer.ts` — vertical lanes algorithm
- `src/image/canvas/regionDrawing.ts` — drawing state machine
- `styles.css` — namespacing, blend modes, z-index values
- `docs/HISTORY.md` — design evolution and decisions
- `docs/TECHNICAL-PATTERNS.md` — documented gotchas (implicit principles)
- `CLAUDE.md` — hard rules (the "reglas inviolables" = design principles in code form)

## Verification

After writing:
1. Every principle should be traceable to specific code (file:line or pattern)
2. No principle should be aspirational — only document what EXISTS
3. Cross-check with CLAUDE.md "reglas inviolables" — they should appear as principles
4. Cross-check with HISTORY.md — design decisions should trace to historical moments
5. The document should be usable for: README (marketing), methods paper (academic), contributor onboarding (development)
