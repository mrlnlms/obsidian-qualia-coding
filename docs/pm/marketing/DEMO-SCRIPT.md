# Qualia Coding — Demo Video Script (5 minutes)

**Date:** 2026-03-03
**Format:** Screen recording with voiceover. No face cam needed.
**Resolution:** 1920x1080, Obsidian in dark mode, clean vault with sample data.
**Tone:** Calm, confident, researcher-to-researcher. Not salesy. Show the thinking, not just the clicking.

---

## Pre-Recording Setup

- [ ] Clean Obsidian vault with sample data pre-loaded:
  - 3 markdown interview transcripts (already partially coded)
  - 1 PDF article (with some text + shape coding)
  - 1 CSV with survey open-ended responses
  - 2-3 images (field photographs)
  - 1 audio file (interview recording, ~2 min)
  - Research Board with a few nodes already placed
- [ ] Codes pre-created: 5-6 codes with distinct colors (e.g., "Trust", "Risk", "Agency", "Institutional Pressure", "Coping Strategy", "Social Network")
- [ ] Code Explorer sidebar open on the left
- [ ] Obsidian dark mode, font size comfortable for recording
- [ ] Hide any personal files — vault should look like a research project

---

## Script

### Opening — The Problem (0:00–0:25)

**[Screen: Obsidian vault file tree, empty editor]**

> "If you do qualitative research, you probably live in two worlds. You code your data in NVivo or ATLAS.ti — and then you come to Obsidian to think. To link ideas, write memos, build theory.
>
> But the coding and the thinking are in different tools. Every insight requires manual copying. Every connection you make in your notes is disconnected from your coded data.
>
> What if they lived in the same place?"

---

### Title Card (0:25–0:30)

**[Screen: Qualia Coding logo or text overlay]**

> "This is Qualia Coding."

---

### Markdown Coding + Margin Bars (0:30–1:15)

**[Screen: Open a markdown interview transcript. Select a passage.]**

> "Let's start with an interview transcript. I select a passage and press Cmd+Shift+C."

**[Action: Coding popover appears. Toggle "Trust" and "Social Network" codes.]**

> "The coding popover shows all my codes. I toggle 'Trust' and 'Social Network'. The text is highlighted with blended colors — both codes are visible at once, not just the last one applied."

**[Action: Pan to the left margin showing margin bars.]**

> "And look at the margin. These are margin bars — MAXQDA's most loved feature, here in open source. Each bar represents a code. You can see at a glance where coding is dense and where it's sparse."

**[Action: Hover over a margin bar label to show bidirectional highlight.]**

> "Hover over a bar, and the corresponding text lights up. Hover over text, and the bars respond. It's bidirectional."

---

### PDF Coding (1:15–1:50)

**[Screen: Open a PDF article. Show existing text highlights + a shape annotation.]**

> "PDFs work the same way. Select text, apply codes. But you can also draw shapes — rectangles, ellipses, freeform polygons — to code diagrams, tables, or figures."

**[Action: Draw a rectangle around a figure in the PDF. Apply "Institutional Pressure" code.]**

> "The shapes use normalized coordinates, so they scale with zoom. And the same per-code opacity blending works here too — overlapping codes blend visually."

---

### CSV Coding (1:50–2:20)

**[Screen: Open a CSV file. AG Grid appears with survey data.]**

> "This is where it gets interesting. Open a CSV — say, survey open-ended responses — and you get a full data grid."

**[Action: Click on a cell. The CM6 segment editor opens inside the cell.]**

> "Click a cell and you get a text editor inside the grid. Select text, apply codes — cell-level coding with the same popover, same codes, same sidebar."

**[Action: Show a row with code chips visible in cells.]**

> "Qualia is the only QDA tool that does cell-level coding on structured data. And yes — it reads Parquet files too. The only one in the world."

---

### Image + Audio (2:20–2:55)

**[Screen: Open a field photograph in Image Coding view.]**

> "Images open in a Fabric.js canvas. Draw regions — rect, ellipse, or freeform polygon — and code them."

**[Action: Quick draw a polygon around a subject in the photo. Apply "Agency" code.]**

> "Coordinates are normalized, so the coding is resolution-independent."

**[Screen: Switch to an audio file. WaveSurfer waveform appears.]**

> "Audio files get a waveform with draggable regions. Each region is a coded segment. Vertical lanes keep overlapping codes readable. The minimap at the top shows the full file at a glance."

**[Action: Click a region to show the popover with codes and memo field.]**

> "Same popover. Same codes. Same workflow — across all seven data types."

---

### Analytics (2:55–3:45)

**[Screen: Open Analytics view. Start on Dashboard.]**

> "Now the part no other free QDA tool offers. Open Analytics and you get 17 views — all built-in, all reading from every engine simultaneously."

**[Action: Switch to Frequency Bars.]**

> "Frequency bars show code distribution across all your files — markdown, PDF, CSV, audio, everything unified."

**[Action: Switch to Co-occurrence Matrix.]**

> "Co-occurrence matrix — five modes: absolute count, percentage, Jaccard, Dice, and presence."

**[Action: Switch to MCA Biplot. Pause for 3 seconds to let it render.]**

> "And this is what makes Qualia unique. Multiple Correspondence Analysis — a biplot showing how codes relate across documents. This usually requires exporting to R. Here it's one click."

**[Action: Switch to Network Graph briefly, then to Lag Sequential Analysis.]**

> "Lag Sequential Analysis. Polar Coordinates. CHAID Decision Trees. Five analytics views that no QDA tool — free or commercial — has built-in. Mixed methods researchers: you do quantitization without leaving your vault."

---

### Research Board (3:45–4:15)

**[Screen: Open Research Board with pre-placed nodes.]**

> "The Research Board is your synthesis canvas. Code cards show frequency counts. Excerpts carry the original text. Sticky notes hold your emerging ideas. KPI cards summarize key metrics."

**[Action: Drag a code card and an excerpt node. Draw an arrow connecting them.]**

> "Connect nodes with arrows. Arrange clusters. This is your thinking wall — the space where systematic coding becomes emergent theory."

**[Action: Zoom out to show the full board.]**

> "No other CAQDAS tool has a freeform research canvas like this."

---

### Unified Sidebar + Graph View (4:15–4:40)

**[Screen: Show Code Explorer sidebar — tree view with Code > File > Segment hierarchy.]**

> "One sidebar serves all seven engines. The Code Explorer shows every code, every file, every segment — across markdown, PDF, CSV, image, audio, and video. Click any segment to navigate directly to it."

**[Action: Click a segment under an audio file to trigger navigation — waveform seeks to timestamp.]**

> "Click an audio segment and the waveform jumps to that timestamp."

**[Screen: Open Obsidian Graph View. Show code-related notes connected.]**

> "And because this is Obsidian, your coded data lives alongside your literature notes, your memos, your emerging theory. The graph view shows connections that linear CAQDAS outputs will never surface."

---

### Closing (4:40–5:00)

**[Screen: Return to the vault overview. Pause.]**

> "Qualia Coding. Seven engines. Seventeen analytics views. Research Board. Margin bars. Per-code blending. All free, local-first, and open source.
>
> Your data stays as JSON in your vault. No subscription. No cloud. No lock-in.
>
> Install it from Obsidian Community Plugins. Link in the description."

**[Screen: End card with GitHub URL and "Qualia Coding" text.]**

---

## Production Notes

### Timing Guide

| Section | Duration | Cumulative |
|---------|----------|------------|
| Opening (problem) | 25s | 0:25 |
| Title card | 5s | 0:30 |
| Markdown + margin bars | 45s | 1:15 |
| PDF coding | 35s | 1:50 |
| CSV coding | 30s | 2:20 |
| Image + Audio | 35s | 2:55 |
| Analytics | 50s | 3:45 |
| Research Board | 30s | 4:15 |
| Sidebar + Graph | 25s | 4:40 |
| Closing | 20s | 5:00 |

### Recording Tips

- **Pace:** Slightly slower than conversation. Let the visuals breathe.
- **Mouse:** Deliberate movements, not frantic. Circle important areas slowly.
- **Pauses:** 2-3 second pauses when switching views to let viewers orient.
- **Errors:** If you misclick, keep going — it feels authentic. Only re-record for script errors.
- **Music:** Optional — low ambient track, not distracting. Or silence with just voiceover.

### Editing

- Cut dead air between sections (keep transitions to <1 second)
- Add subtle zoom-ins when showing the coding popover and margin bars
- Add text overlays for section titles (e.g., "MARKDOWN CODING", "ANALYTICS")
- End card: GitHub URL, "Free • Local-first • Open Source" tagline

### Thumbnail

- Dark background (Obsidian purple/dark gray)
- 3-4 word text: "QDA in Obsidian" or "Free NVivo Alternative"
- Small composite showing margin bars + MCA biplot
- No face, no clutter

### YouTube Metadata

**Title:** "Qualia Coding — Free Qualitative Data Analysis Inside Obsidian (7 Engines, 17 Analytics Views)"

**Description (first 3 lines — shown before "Show more"):**
> Qualia Coding is a free, open-source Obsidian plugin for qualitative data analysis. Code markdown, PDFs, images, audio, video, CSV, and Parquet files — all with built-in analytics including MCA, MDS, and CHAID decision trees.
>
> Install: [Community Plugins link]
> GitHub: [repo link]

**Tags:** qualitative data analysis, obsidian plugin, free QDA software, NVivo alternative, ATLAS.ti alternative, MAXQDA alternative, qualitative coding, mixed methods, MCA biplot, obsidian research, qualitative research tool, open source QDA

**Chapters (for YouTube timestamps):**
```
0:00 The Problem
0:30 Markdown Coding + Margin Bars
1:15 PDF Coding
1:50 CSV Coding
2:20 Image + Audio Coding
2:55 Analytics (17 Views)
3:45 Research Board
4:15 Unified Sidebar + Graph View
4:40 Get Started
```

---

## Derivative Content from This Video

After recording, extract these clips for social media:

| Clip | Duration | Platform | Caption |
|------|----------|----------|---------|
| Margin bars hover (bidirectional) | 15s | Twitter/Mastodon | "MAXQDA-style margin bars, free in Obsidian." |
| CSV cell-level coding | 15s | Twitter | "The only QDA tool that codes CSV cells. And Parquet." |
| MCA Biplot rendering | 10s | Twitter | "MCA Biplot, built-in. No R, no SPSS, no export." |
| Research Board drag + connect | 15s | Twitter | "Your thinking wall. Code cards, excerpts, sticky notes — infinite canvas." |
| Audio waveform region coding | 15s | Reddit r/ObsidianMD | "Code interview recordings directly in Obsidian." |
| Full demo (re-upload) | 5 min | Reddit r/qualitativeresearch | Full post with description |

---

*Script generated 2026-03-03. Aligned with PMM Strategy messaging architecture and README copy.*
