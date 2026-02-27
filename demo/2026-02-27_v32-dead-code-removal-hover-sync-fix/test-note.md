---
codes:
  - name: "cleanup"
    color: "#8B5CF6"
  - name: "performance"
    color: "#10B981"
  - name: "hover-sync"
    color: "#F59E0B"
markers:
  - code: "cleanup"
    from: 58
    to: 102
  - code: "performance"
    from: 145
    to: 189
  - code: "hover-sync"
    from: 210
    to: 255
---

# What's new in v32

## Dead code removal + hover sync fix + dead state perf

This version focuses on cleanup and stability:

1. **Dead code removal** — removed unused `handleWidget.ts` and duplicate drag handler code that was no longer referenced after the v31 overlay refactor.

2. **Hover sync fix** — fixed bidirectional hover: hovering a label in the margin panel now correctly highlights the corresponding handle overlay in the editor. Previously, margin panel hover events were not propagating to the handle overlay layer.

3. **Dead state perf** — removed unused hover state tracking from the CM6 state field. This state was being maintained but never read after the hover system was moved to DOM events in v31. Removing it reduces unnecessary state field transactions.

## How to verify

1. Open the console — look for `[CodeMarker v2] v32 loaded`
2. Create markers on this text, then hover labels in the margin panel — the corresponding text decoration in the editor should highlight
3. Check that hover from editor to margin panel also works (bidirectional)
4. General performance should feel the same or slightly snappier due to fewer state field updates

This is a cleanup version with quality-of-life improvements. The marker and coding should feel the same as the previous version, but the codebase is leaner and more consistent. No new features are introduced, but hover sync is now reliable.
