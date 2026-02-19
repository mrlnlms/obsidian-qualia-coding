---
version: "35.3"
engine: codemarker-pdf
date: 2026-02-19
---

# What's new in v35.3

## PDF Margin Panel (MAXQDA-style) + Undo/Redo

This version adds two major features to the PDF coding engine:

1. **Margin Panel** — Colored vertical bars appear in the left margin of the PDF view, one per code. This mirrors the MAXQDA-style margin panel already present in the markdown engine. Labels are clickable.

2. **Undo/Redo** — Full undo and redo support for PDF coding operations. You can revert or re-apply marker additions, edits, and deletions.

## How to verify

1. Open a PDF file in the vault (e.g., `Claude.pdf` or `User Research Study.pdf`)
2. Select text and create a code via the CodeFormModal
3. Verify that a colored bar appears in the left margin next to the coded passage
4. Create a second code on a different passage — verify both bars appear with distinct colors
5. Use Ctrl+Z / Cmd+Z to undo the last coding operation — the marker should disappear
6. Use Ctrl+Shift+Z / Cmd+Shift+Z to redo — the marker should reappear
7. Click a label on a margin bar to open the code detail panel
