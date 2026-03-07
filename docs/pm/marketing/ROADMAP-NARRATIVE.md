# Qualia Coding — Roadmap

**Last updated:** March 2026
**Status:** Pre-release. Community plugin listing in progress.

---

## Where We Are

Qualia Coding is a qualitative data analysis plugin for Obsidian with seven coding engines (Markdown, PDF, CSV/Parquet, Image, Audio, Video), 17 analytics views, and a Research Board. It is free, open-source, and local-first — your data stays as JSON in your vault.

The plugin is functional and deep (28,000 lines of code across 108 source files), but it is not yet listed in the Obsidian Community Plugin Directory. That changes now.

## Where We're Going

Our roadmap is organized around three themes, sequenced so that each phase creates the foundation for the next.

---

## Phase 1: Get Into Your Hands (Months 1–2)

**The problem:** Qualia Coding exists but is invisible. It is not in the Obsidian Community Plugin Directory. Researchers who search for "qualitative coding" in Obsidian find Quadro (a simpler, markdown-only alternative) but not Qualia. The best QDA tool inside Obsidian cannot help anyone who doesn't know it exists.

**What we're doing:**

- **Community Plugin Directory listing** — the single most important milestone. Once listed, you can install Qualia from Obsidian's plugin browser in one click.
- **Code hierarchy** — parent/child codes (Saldana's code-to-theme hierarchy). This is a basic QDA expectation that every competitor has. Plan is complete; implementation is ~200 lines of code.
- **Fuzzy code search** — when you have 30+ codes, scrolling through a list is painful. A fuzzy search modal lets you find and apply codes instantly.
- **Quick switcher** (`Cmd+Shift+C`) — select text, press the shortcut, type a code name, done. For power users who want speed.
- **Demo video and sample vault** — a 5-minute walkthrough of all seven engines, plus a downloadable vault with pre-coded sample data so you can explore before committing your own research.

**What this enables:** Discovery. You can find, install, and try Qualia Coding without friction.

**What we're NOT doing yet:** AI features, intercoder reliability, REFI-QDA export, collaboration. These matter enormously — but they matter more after you can actually find the plugin.

---

## Phase 2: Earn Your Trust (Months 3–4)

**The problem:** Qualitative researchers invest months of irreplaceable interpretive work in their coding tool. Trusting a new, free, solo-developer plugin with dissertation data requires more than features — it requires interoperability, methodological depth, and proof that the tool will evolve.

**What we're doing:**

- **REFI-QDA export** — the standard interchange format supported by NVivo, ATLAS.ti, and MAXQDA. With REFI-QDA export, your Qualia project can be opened in any major CAQDAS tool. This is your escape hatch: you can use Qualia knowing that if you ever need to switch, your work comes with you.
- **AI-assisted coding (technical investigation)** — we will build a prototype of local-first AI code suggestion using Ollama, so your data never leaves your machine. The design principle: AI surfaces patterns and suggests codes, but you make every interpretive decision. This aligns with the epistemological consensus that qualitative coding is an act of interpretation, not a task to automate (Jowsey et al., 2025).
- **Memo support for all engines** — Markdown and PDF currently lack the memo field that Audio and Video already have. Memos are where interpretation lives (Saldana, 2020); they should be available everywhere.
- **Toggle code visibility** — when you have 20+ codes, the editor becomes a rainbow. A per-code visibility toggle lets you focus on what matters right now.

**What this enables:** Confidence. You can use Qualia knowing your data is portable (REFI-QDA), your interpretive process is supported (memos everywhere), and AI respects your methodology.

---

## Phase 3: Deepen Your Analysis (Months 5–6)

**The problem:** Academic qualitative research has methodological requirements that no free tool currently meets — intercoder reliability for team coding, case variables for mixed methods, and structured workflows for established traditions. Without these, Qualia is useful for individual exploration but cannot be recommended for dissertation research or funded studies.

**What we're doing (one of the following, based on Phase 2 results):**

- **AI-assisted coding (full implementation)** — if the Phase 2 prototype validates local-first AI feasibility, we build the full feature: code suggestion from your existing codebook, pattern highlighting across documents, anomaly surfacing. Local-first (Ollama) for sensitive data, with optional cloud API for those who choose it. No token metering. No subscription. Free.
- **OR: Intercoder reliability** — Cohen's kappa and percentage agreement for comparing coding between researchers. This is the feature most requested by methods committees and peer reviewers. It transforms Qualia from "interesting tool for solo work" to "credible tool for publishable research."

**What this enables:** Academic legitimacy. Either AI coding or intercoder reliability (or both, if capacity allows) moves Qualia from "promising" to "recommendable."

---

## What's Explicitly NOT on the 6-Month Roadmap

We believe in honesty about scope. These items are valuable but deliberately deferred:

| Not now | Why |
|---------|-----|
| **Real-time collaboration** | Obsidian's local-first architecture makes this architecturally complex. Use shared vaults (Git, Syncthing) for team workflows today. |
| **Built-in transcription** | Whisper and other external tools handle this excellently. We focus on coding, not recording. |
| **Projects & workspaces** | Important for organizing multi-study research, but premature before basic features (hierarchy, memos, ICR) are solid. |
| **Parquet evolution** | Current Parquet read support is sufficient. Lazy loading for 100K+ row datasets will come when demand warrants it. |
| **Survey import workflow** | CSV and Parquet already cover most survey export formats. A dedicated workflow adds little beyond what exists. |

These remain on our long-term roadmap. They will be prioritized based on community feedback once the plugin is listed and real usage data exists.

---

## How Priorities Are Set

Every item on this roadmap was scored using two complementary frameworks:

1. **RICE** (Reach, Impact, Confidence, Effort) — measures execution efficiency. What delivers the most value per week of development?
2. **Strategic Alignment** — measures fit with our three current objectives: discoverability (get listed), credibility (earn academic trust), and product quality (ship reliable features).

Items that score high on both frameworks are built first. Items that score high on strategy but low on RICE (like AI coding) are investigated before being committed to — hence the "technical spike" in Phase 2 before the full build in Phase 3.

We also maintain an **Assumption Map** that tracks the beliefs underlying our roadmap. The most critical assumption: "qualitative researchers already use Obsidian in meaningful numbers." If this proves false, the roadmap changes. We are validating this through community engagement and install data.

---

## How to Influence the Roadmap

This roadmap reflects our best judgment today. Your feedback changes it.

- **GitHub Issues** — file a bug or feature request. Every issue is read and responded to.
- **Obsidian Forum** — join the Qualia Coding discussion thread (coming after listing).
- **MMIRA 2026** — if you're attending in Brisbane (August), come talk to us about mixed methods workflows.

The features that get built next are the features real researchers tell us they need. We have no investors to please, no board to report to, and no quarterly revenue targets to hit. The only metric that matters is: does this tool make your research better?

---

## Summary

**Phase 1 (Months 1–2):** Get discoverable — listing, code hierarchy, quick wins, demo video, sample vault.

**Phase 2 (Months 3–4):** Earn trust — REFI-QDA export, AI coding prototype (local-first), memos everywhere, toggle visibility.

**Phase 3 (Months 5–6):** Deepen analysis — full AI coding OR intercoder reliability (based on Phase 2 learnings).

**The principle:** Ship what researchers need now. Investigate what they'll need next. Be honest about what we can't do yet.

---

*Qualia Coding is built by a researcher, for researchers. Grounded in mixed methods methodology (Sandelowski, Onwuegbuzie, Creswell, Saldana). Free. Local-first. Open source.*
