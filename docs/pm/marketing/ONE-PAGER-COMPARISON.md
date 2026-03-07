# Qualia Coding vs. Traditional QDAS

**Free qualitative data analysis inside Obsidian. 7 data types. 17 analytics views. Local-first.**

---

## The Problem

Qualitative researchers live in two worlds: a **coding tool** (NVivo, ATLAS.ti, MAXQDA) for systematic analysis, and a **thinking tool** (Obsidian, Notion, paper) for interpretation and synthesis. Moving between them means manual copying, lost provenance, and fragmented insight.

> *"In Atlas.ti, I'm managing the project, the codes, the documents. In Obsidian, I'm just... thinking with the data."*
> — Synthetic Users Research, Feb 2026

## The Solution

**Qualia Coding** is an Obsidian plugin that brings research-grade QDA into your knowledge management system. Code, analyze, and synthesize — all inside your vault.

---

## Feature Comparison

| | **Qualia Coding** | **NVivo** | **ATLAS.ti** | **MAXQDA** |
|---|:---:|:---:|:---:|:---:|
| **Price** | **Free** | $118–1,800/yr | $51–670/yr | EUR 253–1,440/yr |
| **Open source** | Yes | No | No | No |
| **Local-first (no cloud)** | Yes | Yes | Partial (AI = cloud) | Yes |
| **Data format** | JSON (portable) | .nvp (proprietary) | .atlproj (proprietary) | .mx24 (proprietary) |
| | | | | |
| **Text / Markdown coding** | Yes | Yes | Yes | Yes |
| **PDF coding** | Yes (text + shapes) | Yes (basic) | Yes | Yes |
| **Image coding** | Yes (Fabric.js canvas) | Yes | Yes | Yes |
| **Audio coding** | Yes (WaveSurfer regions) | Yes | Yes | Yes |
| **Video coding** | Yes (player + waveform) | Yes | Yes | Yes (transcript-based) |
| **CSV cell-level coding** | **Yes (unique)** | No | No | No |
| **Parquet coding** | **Yes (unique)** | No | No | No |
| | | | | |
| **Margin bars** | Yes | No | No | Yes |
| **Per-code opacity blending** | **Yes (unique)** | No | No | No |
| **Research Board / Canvas** | **Yes (freeform)** | No | Network view | MAXMaps (structured) |
| **Coding popover** | Yes (all engines) | Yes | Yes | Yes |
| **Code hierarchy** | Planned | Yes | Yes | Yes |
| | | | | |
| **Built-in analytics** | **17 views** | Limited | Basic | Some |
| **MCA Biplot** | **Yes** | No | No | No |
| **MDS Map** | **Yes** | No | No | No |
| **Lag Sequential Analysis** | **Yes** | No | No | No |
| **Polar Coordinates** | **Yes** | No | No | No |
| **CHAID Decision Tree** | **Yes** | No | No | No |
| **Co-occurrence Matrix** | Yes (5 modes) | Yes | Yes | Yes |
| **Network Graph** | Yes | Yes | Yes | Yes |
| **Word Cloud** | Yes | Yes | Yes | Yes |
| | | | | |
| **AI-assisted coding** | Planned (local-first) | Yes (add-on) | Yes (OpenAI, token-metered) | Yes (EUR 120/yr add-on) |
| **Intercoder reliability** | Planned | Yes | Yes | Yes |
| **REFI-QDA export** | Planned | Yes | Yes | Yes |
| **Collaboration** | No | Cloud (unreliable) | Web (real-time) | TeamCloud (add-on) |
| **Transcription** | No | Yes (40+ langs) | Yes (30+ langs) | Yes (add-on) |
| | | | | |
| **Obsidian integration** | **Native** | No | No | No |
| **Graph view for codes** | **Yes** | No | No | No |
| **Backlinks to notes** | **Yes** | No | No | No |
| **PKM ecosystem** | **Full** | None | None | None |
| | | | | |
| **Platform** | Obsidian (Win/Mac/Linux) | Win + Mac | Win + Mac + Web + Mobile | Win + Mac |
| **Owner** | Independent | Lumivero (PE) | Lumivero (PE) | VERBI (family) |

---

## 5 Things Only Qualia Coding Does

### 1. QDA Inside Your Knowledge Graph
Your codes, memos, and research notes live in the same vault. Obsidian's graph view reveals relationships between codes and notes that linear CAQDAS outputs cannot surface.

### 2. CSV + Parquet Coding
The only QDA tool in the world that lets you code structured data at the cell level. Code survey open-ends alongside interview transcripts in the same project.

### 3. 5 Exclusive Analytics Views
MCA Biplot, MDS Map, Lag Sequential Analysis, Polar Coordinates, CHAID Decision Tree — built into the coding tool. No export to R or SPSS needed.

### 4. Per-Code Opacity Blending
When multiple codes overlap, their colors blend visually. See co-occurrence at a glance instead of "last code wins" coloring.

### 5. Freeform Research Board
Drag code cards, excerpts, sticky notes, and KPI cards onto an infinite canvas. Build your theoretical argument visually. No other CAQDAS tool has a freeform synthesis canvas.

---

## What Qualia Coding Does NOT Do (Yet)

| Gap | Status | Workaround |
|-----|--------|-----------|
| AI-assisted coding | Roadmap #1 (local-first approach) | Manual coding with margin bars and popover |
| Intercoder reliability | Roadmap #3 | Use CAQDAS for ICR phase, Qualia for individual analysis |
| REFI-QDA export | Roadmap | JSON export available; QDPX format planned |
| Collaboration | Not planned short-term | Share vault via Git or Syncthing |
| Transcription | Not planned | Use Whisper, Otter.ai, or built-in OS transcription externally |
| Code hierarchy | Roadmap #1 (plan complete) | Flat code list with 12-color palette |

We believe in honesty about gaps. Qualia Coding is deep (28K LOC, 7 engines, 17 analytics views) but young. If you need ICR or AI coding today, MAXQDA or ATLAS.ti are better choices right now.

---

## Who Is Qualia Coding For?

**Best fit:**
- PhD students and postdocs who already use Obsidian
- Mixed methods researchers who need built-in analytics
- Researchers who cannot afford $500+/yr CAQDAS licenses
- Anyone who values data ownership and local-first privacy

**Not the best fit (today):**
- Large teams needing real-time collaboration
- Researchers whose committees require intercoder reliability reports
- Institutions with mandated NVivo/MAXQDA site licenses

---

## The Cost of "Free" CAQDAS

| Tool | 4-Year PhD Cost | Data Portability |
|------|----------------|-----------------|
| NVivo (student) | ~$472 | Locked in .nvp |
| NVivo (academic) | ~$3,396 | Locked in .nvp |
| ATLAS.ti (student cloud) | ~$240 | Locked in .atlproj |
| ATLAS.ti (academic) | ~$440 | Locked in .atlproj |
| MAXQDA (academic) | ~$1,012 | Locked in .mx24 |
| **Qualia Coding** | **$0** | **JSON in your vault** |

When you graduate, change institutions, or lose your license — your NVivo/ATLAS.ti/MAXQDA project files become inaccessible. Qualia Coding data is plain JSON, readable by any tool, forever.

---

## Get Started

1. Install Obsidian: [obsidian.md](https://obsidian.md)
2. Install Qualia Coding: Community Plugins → Search "Qualia Coding"
3. Select text → `Cmd+Shift+C` → Create your first code
4. Open Code Explorer → See your codes across all files
5. Open Analytics → Explore 17 built-in views

**GitHub:** [link]
**Tutorials:** [YouTube playlist link]
**Sample vault:** [download link]

---

## About

Qualia Coding is built by a researcher, for researchers. Grounded in mixed methods methodology (Sandelowski, Onwuegbuzie, Creswell, Saldana). Designed around the principle that qualitative coding is an act of interpretation — and interpretation belongs inside your knowledge system, not outside it.

28,234 lines of TypeScript. 7 engines. 17 analytics views. Free. Local-first. Open source.

> *"When those connections start to pop out, it's like a small jolt of electricity."*
> — Dr. Nia Okonkwo, Synthetic Users Research

---

*Last updated: 2026-03-03*
