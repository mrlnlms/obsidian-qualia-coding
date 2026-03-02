---
tags: [test, v40]
---

# v40 — Fix: margin panel after file rename

## What's new
- Fixed bug where the margin panel (MAXQDA-style coded segments sidebar) would disappear after renaming a markdown file
- The margin panel now listens for `setFileIdEffect` and updates its internal `fileId` reference when the file is renamed

## How to verify
1. Open a markdown file that has coded segments (margin panel visible)
2. Rename the file (F2 or right-click → Rename)
3. Verify the margin panel stays visible and continues showing the correct coded segments
4. The console should show: `[qualia-coding] v40 loaded`

## Test content

This is a test note for verifying the margin panel fix. Code some segments in this file, then rename it to confirm the panel persists.

Some sample text to code:
- First paragraph for testing margin panel persistence
- Second paragraph with different content
- Third paragraph to verify all segments survive a rename
