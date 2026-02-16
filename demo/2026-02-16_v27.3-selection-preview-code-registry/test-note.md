---
codes:
  - name: "Theme"
    color: "#E91E63"
  - name: "Pattern"
    color: "#2196F3"
---

# v27.3 — Selection Preview + CodeDefinition Registry

## What's new
- **CodeDefinition Registry**: codes now have a central identity (name, color, description) independent of individual markers. Colors are consistent across all markers using the same code.
- **Selection preview**: when creating a marker via the Code Form Modal, the selection range is previewed in the state field before confirming.
- **Migration**: existing markers automatically populate the registry on first load.

## How to verify
1. Open console — confirm `[obsidian-codemarker-v2] v27.3 loaded` message
2. Select text and open the code form modal — the selection should show a preview highlight
3. Create markers with the same code name — they should share the same color from the registry
4. Check that existing markers from previous versions still render correctly (migration path)

## Test content

This paragraph is for testing the ==selection preview==. Select any portion of this text, then use the code form modal to see the preview highlight before confirming.

The CodeDefinition Registry ensures that every marker tagged with "Theme" uses the same pink color, and every "Pattern" marker uses the same blue — regardless of which file or when they were created.
