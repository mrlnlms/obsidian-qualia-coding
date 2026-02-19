---
version: 33.3
engine: codemarker-csv
date: 2026-02-19
feature: batch-coding-header-tag
---

# What's new in v33.3

Batch coding via header tag button and cod-seg chip interaction:

- **Batch coding popover**: Click the tag button in a cod-frow column header to open a popover that applies/removes codes to ALL visible (filtered) rows at once
- **Cross-row toggle state**: Shows all/none/partial state across rows for each code
- **Cod-seg chip opens editor**: Clicking a cod-seg tag chip now opens the segment editor alongside the sidebar

## How to verify

1. Open the CSV Coding View (ribbon icon or command palette)
2. Load a CSV file (e.g., `Daily Count Jan 26.csv`)
3. Look for the tag button in a cod-frow column header — click it to see the batch coding popover
4. Try toggling codes on/off for all visible rows at once
5. Click a cod-seg tag chip — it should open the segment editor
