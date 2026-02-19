---
version: 33.2
engine: codemarker-csv
date: 2026-02-19
---

# What's new in v33.2

- **CM6 inline editor** for CSV segment coding — edit code annotations directly in the CSV view
- **Extensions reuse** — full CM6 extensions from markdown editor reused in CSV segment editor
- **Margin panel fix** — corrected alignment of the margin panel in CSV segment editor

# How to verify

1. Open the CSV Coding view (ribbon icon or command palette)
2. Load `Daily Count Jan 26.csv`
3. Select a segment and try to edit its code annotation inline — should open a CM6 editor
4. Verify the margin panel is properly aligned (no visual offset)
5. Check that syntax highlighting and other CM6 extensions work in the inline editor
