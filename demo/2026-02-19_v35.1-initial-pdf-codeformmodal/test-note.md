---
tags: [codemarker, pdf, test]
version: "35.1"
---

# v35.1 — Initial PDF + CodeFormModal

## What's new
- **CodeMarker PDF engine** appears as a new plugin in the demo vault
- PDF selection capture with cross-page detection
- CodeFormModal for creating/editing codes on PDF highlights
- Double-click to edit existing markers
- PDF Code Explorer and Code Detail sidebar views
- Ribbon icon for quick access to PDF Code Explorer

## How to verify
1. Enable "CodeMarker PDF" in Settings > Community plugins
2. Open `Claude.pdf` or `User Research Study.pdf`
3. Select text in the PDF — a coding popover should appear
4. Create a code using the popover menu
5. Check the PDF Code Explorer sidebar (highlighter icon in ribbon)
6. Double-click an existing marker to edit it via CodeFormModal
