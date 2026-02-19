---
tags: [codemarker-pdf, test, v35.8]
---

# v35.8 — Margin overlay + null guards + thumbnail

## What's new
- Margin overlay panel for PDF annotations — marks appear in page margins
- Null guards throughout the PDF pipeline to prevent crashes on edge cases
- Thumbnail rendering for PDF page previews

## How to verify
1. Open a PDF file in the vault (e.g., Claude.pdf or User Research Study.pdf)
2. Create annotations — check that margin overlay shows marks in the page margin area
3. Verify thumbnail previews render correctly for pages
4. Navigate between pages rapidly to test null guards (no console errors expected)
