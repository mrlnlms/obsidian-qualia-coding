---
tags: [codemarker-pdf, engine-test, v35]
---

# v35.2 — Bidirectional Hover + Rename Tracking

## What's new
- **Bidirectional hover**: Hovering a highlight in the PDF view now causes the corresponding entry in the Code Explorer/Detail sidebar to highlight, and vice versa — hovering a sidebar entry glows the PDF highlight.
- **File rename tracking**: When you rename a PDF file in the vault, all markers associated with that file automatically update their internal file references. No orphaned annotations.

## How to verify

1. Open a PDF file (e.g., `User Research Study.pdf`) and create 2-3 coded highlights on different passages
2. Open the PDF Code Explorer sidebar (ribbon icon or command palette)
3. **Test bidirectional hover**:
   - Hover a highlight in the PDF — the sidebar entry should visually highlight
   - Hover a sidebar entry — the PDF highlight should glow
4. **Test rename tracking**:
   - Right-click the PDF file in the file explorer and rename it
   - Open the PDF Code Explorer — all markers should still be associated with the renamed file
   - The coded highlights should still render correctly on the renamed file
