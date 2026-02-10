---
version: 25
date: 2026-02-10
description: Menu system, triggers, settings UI, CSS
era: 3
---

# v25 — Menu system, triggers, settings UI, CSS

## What's new
- **Menu System (Approach A)**: Obsidian native Menu API with selection preview workaround
- **Menu System (Approach B)**: CM6 Tooltip-based menu using Obsidian CSS variables
- **Menu Controller**: Orchestrator choosing Approach A or B per settings
- **5 Trigger entry points**: Text selection (mouseup), right-click submenu, file menu, ribbon button, commands
- **Settings Tab**: Full settings UI for configuring menu approach and behavior
- **CSS**: Styles for highlights, handles, drag states, selection preview, tooltip menu

## How to verify
1. Open console: should see `[CodeMarker v2] v25 loaded`
2. Select text and check if the coding menu appears (mouseup trigger)
3. Right-click in editor: look for "Code Options" submenu
4. Check Settings > CodeMarker v2 for the settings tab
5. Verify highlight styles and handle appearance on coded spans

## Demo content

Select this paragraph to test the menu trigger. The menu should appear near the selection offering options to add or remove codes. Try both Approach A (Obsidian native) and Approach B (CM6 tooltip) via settings.

This is another paragraph for testing multiple selections and code markers across different text blocks.
