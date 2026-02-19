---
version: "35.7"
engine: codemarker-pdf
feature: intersection-handles-transitions
date: 2026-02-19
---

# What's new in v35.7

- **Intersection handles**: Overlapping markers now show dedicated handles at intersection boundaries, enabling independent resizing of each marker within shared regions.
- **Handle transitions**: Moving between intersection zones and single-marker zones produces smooth visual transitions — handles update position and style without flicker.

# How to verify

1. Open a PDF file in the demo vault (e.g., `Claude.pdf` or `User Research Study.pdf`)
2. Create two overlapping markers on nearby text passages so they share an intersection zone
3. Hover over the intersection zone — dedicated handles should appear at the intersection boundaries
4. Drag a handle within the intersection to resize one marker independently of the other
5. Move the mouse from the intersection zone to a single-marker zone — handles should transition smoothly without flicker
