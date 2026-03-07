# Product Strategy Narrative: Qualia Coding — 2026 H1

**Date:** 2026-03-03
**Period:** March–August 2026 (6 months)
**Context:** Solo developer, free open-source Obsidian plugin, pre-listing, zero revenue, zero funding.

---

## The One-Paragraph Context

The qualitative data analysis market ($1.2B, growing to $1.9B by 2032) just consolidated: private equity now owns both NVivo and ATLAS.ti, the #1 and #2 tools. Researchers face rising prices, data lock-in, and AI features that conflict with their methodology. Meanwhile, Obsidian has become the knowledge management tool of choice for technical academics — but no serious QDA tool exists inside it. Qualia Coding is a 28,000-line plugin that brings research-grade qualitative coding to Obsidian across seven data types, with analytics capabilities no competitor offers. The challenge is not whether the product is good enough. The challenge is that nobody knows it exists.

---

## Strategic Theme 1: Discoverability

**The problem:** Qualia Coding is not listed in the Obsidian Community Plugin Directory. Researchers who search for "qualitative coding" in Obsidian find Quadro — a simpler, markdown-only alternative that is already listed. Every week Qualia remains invisible, Quadro accumulates installs and occupies the "Obsidian QDA" mental slot. The best product nobody can find is worth zero.

**Our response:**
- Submit to Obsidian Community Plugin Directory (the single highest-leverage action)
- Ship three quick-win features before listing (code hierarchy, fuzzy search, quick switcher) to deepen the product beyond Quadro's reach
- Record a 5-minute demo video and publish a downloadable sample vault so new users can explore without risk
- Email the CAQDAS Networking Project at University of Surrey (the software-neutral evaluator that trains 7,000+ researchers annually) requesting a review

**The metric it moves:** Installs. Target: 200 in the first month, 500 by day 90.

**Why now:** Quadro's listing advantage compounds daily. The Lumivero consolidation (NVivo + ATLAS.ti under one PE owner) is creating anxiety among researchers about vendor dependence. MAXQDA just eliminated perpetual licenses, pushing cost-sensitive users to look for alternatives. The window for an independent, free, open-source option is open — but it won't stay open forever.

---

## Strategic Theme 2: Credibility

**The problem:** Academic researchers do not adopt tools on features alone. They adopt tools their advisor recommended, their methods course taught, or their peer reviewed. A free, unlisted plugin by a solo developer — no matter how deep — carries an implicit question: "Can I trust this with my dissertation data?" Without credibility signals, the answer is no.

**Our response:**
- Implement REFI-QDA export — the interchange format supported by NVivo, ATLAS.ti, and MAXQDA. This is the escape hatch: researchers can use Qualia knowing their work is portable. Trust comes from freedom to leave.
- Build AI-assisted coding with a local-first architecture (Ollama). Not "AI does the coding for you" (ATLAS.ti's approach, which a 2025 paper in Qualitative Inquiry explicitly rejects). Instead: AI surfaces patterns, suggests codes, highlights anomalies — the researcher makes every interpretive decision. The message: "AI that respects your methodology."
- Submit a methods note to Forum: Qualitative Social Research (FQS) — a Diamond OA journal with zero publication costs. A peer-reviewed paper gives researchers something to cite, creating a discovery loop: citation → search → install → more citations.
- Submit a workshop proposal to MMIRA 2026 (Mixed Methods International Research Association, Brisbane, August 2026).

**The metric it moves:** Academic recommendations. Target: 1 published mention, 1 conference presentation, 1 CAQDAS Networking Project review within 6 months.

**Why now:** QualCoder (open-source competitor) shipped AI coding with Ollama support in 2025. MAXQDA added multi-document AI coding in February 2026. Every month without AI positions Qualia behind even free alternatives. But the window for a principled approach ("AI amplifies, doesn't substitute") is still open — no tool has claimed this position convincingly.

---

## Strategic Theme 3: Analytical Depth

**The problem:** Free QDA tools are perceived as "good enough for a class project, not for real research." The features that separate a toy from a tool are: intercoder reliability (required by dissertation committees), case variables (required for mixed methods joint displays), and structured export (required for reproducibility). Without these, Qualia cannot be recommended for funded research or publications that will face peer review.

**Our response:**
- Implement intercoder reliability (Cohen's kappa, percentage agreement) — the feature most frequently cited by methods committees as a requirement. This transforms Qualia from "interesting for solo exploration" to "credible for publishable research."
- Add case variables per document — metadata (participant demographics, interview date, site) that enables the code-by-variable cross-tabulations central to mixed methods analysis.
- Both of these feed into the 17 analytics views already built — including 5 that no competitor offers (MCA Biplot, MDS Map, Lag Sequential Analysis, Polar Coordinates, CHAID Decision Tree). The analytics are already there. The data structures to fully exploit them are not. This phase closes that gap.

**The metric it moves:** Retention and recommendation depth. Target: researchers who complete a full coding project in Qualia (not just try it and leave).

**Why now:** The analytics engine is already built and differentiated. The investment has been made. But without ICR and case variables, researchers can't fully use it for the work that matters most to them. This is the lowest-effort path to the highest-value outcome: unlock capabilities that already exist.

---

## The Progression Story

Each phase creates the precondition for the next:

**Month 1–2 (Discoverability):** Listing + quick wins + demo → researchers can find, install, and try Qualia. This generates the first install data, GitHub issues, and community feedback. Without this, everything that follows is academic.

**Month 3–4 (Credibility):** REFI-QDA export + AI prototype + conference submission → researchers who tried Qualia in Phase 1 gain confidence that their work is portable and that the tool is evolving. The AI prototype either validates local-first feasibility (proceed to full build) or reveals constraints (pivot to alternative approach). The MMIRA submission puts Qualia in front of mixed methods researchers — the audience most likely to value the analytics engine.

**Month 5–6 (Depth):** AI full build OR ICR → the feedback from Phase 1–2 determines which. If researchers say "I need AI to keep up with my coding workload," we build AI. If they say "my committee requires intercoder reliability," we build ICR. The data from Phases 1–2 makes this a decision, not a guess.

**The arc:** Invisible → Discoverable → Trusted → Indispensable.

---

## Executive Summary (Under 100 Words)

Qualia Coding is a free, open-source qualitative data analysis plugin for Obsidian — seven data types, 17 analytics views, local-first. The QDAS market is consolidating under private equity. Researchers need an independent alternative. Our 6-month plan: get listed in Obsidian's plugin directory (month 1–2), earn trust through REFI-QDA export and local-first AI (month 3–4), and deepen analytical credibility with intercoder reliability or full AI coding (month 5–6). The product exists. The strategy is: make it findable, then trustworthy, then indispensable.

---

## Questions to Prepare For

### 1. "You're one person maintaining 28,000 lines of code across 7 engines. How is this sustainable?"

**Answer:** It's sustainable because of two architectural decisions made early. First, all seven engines share a common infrastructure — one codebook registry, one coding popover, one sidebar, one data manager. Adding a new engine is ~1,000 lines, not 10,000. The shared core means a fix in the popover improves all seven engines simultaneously. Second, the analytics engine reads from all engines but is decoupled from them — it can evolve independently.

The honest caveat: a solo developer cannot build features, produce tutorials, manage community, and write academic papers simultaneously. The RICE prioritization explicitly limits active workstreams to two at a time. The DROP list (8 items removed from active planning) exists to prevent scope creep. Sustainability comes from saying no, not from working harder.

The long-term answer: if Qualia reaches 5,000+ installs with active community engagement, contributions from other developers become viable. The codebase is well-documented (CLAUDE.md, 7 supporting docs, strict TypeScript) specifically to lower the contribution barrier. But this is a hope, not a plan. The 6-month roadmap assumes solo capacity.

### 2. "How do you compete with tools backed by $100M+ in PE funding and 30 years of institutional relationships?"

**Answer:** We don't compete head-to-head. Qualia occupies a different category: "research-grade QDA inside a PKM tool." NVivo and ATLAS.ti are standalone applications. MAXQDA is a standalone application. Qualia lives inside Obsidian — where the researcher's literature notes, memos, and emerging theory already live. The competitive alternative is not "Qualia vs NVivo" but "coding and thinking in the same place vs coding in one tool and thinking in another."

The specific advantages that institutional funding cannot easily replicate:
- **Obsidian-native integration** (graph view, backlinks, community plugins) requires building on Obsidian's platform. Incumbents would need to rebuild their products or build an Obsidian plugin — neither is likely.
- **Local-first, file-based storage** is architecturally incompatible with the cloud-subscription model that PE investors require for revenue extraction.
- **Free** is not a price point that PE-backed companies can match sustainably.

The anti-persona is explicit: large teams with IT-mandated NVivo site licenses are not our audience and never will be. We serve the researchers those institutions underserve — unfunded PhDs, developing-world institutions, independent scholars, and anyone who values data ownership over institutional convenience.

### 3. "What's the endgame? Free forever, or is monetization coming?"

**Answer:** Free forever for the core plugin. This is not a strategy to be revised later — it is a design principle. Academic tools that start free and add paywalls destroy the trust that made them viable. The QDAS market's biggest vulnerability is cost: researchers resent paying $500+/year for highlight-and-tag software. Qualia's value proposition collapses if it charges.

Possible future revenue (none planned, all hypothetical):
- **Premium cloud AI** — local-first AI is free; optional cloud API with higher-quality models could be paid. Researchers who don't want cloud AI lose nothing.
- **Institutional support contracts** — universities pay for priority support and training. The plugin remains free.
- **Sponsorship** — open-source sustainability via GitHub Sponsors or academic grants.

But the honest answer is: monetization is not the goal. This project exists because a researcher needed a tool that didn't exist, built it, and wants other researchers to benefit. If it never generates revenue but enables good research, that is success.

---

## What's Not on the Roadmap (and Why)

**Real-time collaboration** — Obsidian's local-first, file-based architecture makes real-time multi-user editing architecturally complex. Every CAQDAS tool that has tried cloud collaboration has struggled (NVivo's Collaboration Cloud is described as "catastrophic" in reviews; MAXQDA's TeamCloud is a paid bolt-on). We will not ship a mediocre collaboration feature to check a box. Researchers can share vaults via Git or Syncthing today.

**Built-in transcription** — Whisper (open-source, local, excellent quality) exists. Building a transcription engine into a QDA plugin adds massive scope for marginal value. We focus on coding, not recording. Use the best transcription tool you can find, then bring the transcript into Qualia.

**Mobile support** — Obsidian plugins on mobile have significant limitations (no custom views, restricted API surface). Qualitative coding requires screen real estate (margin bars, sidebars, analytics). Mobile coding is a compromised experience that would dilute the desktop quality. When Obsidian's mobile plugin API matures, we will revisit.

---

*Narrative generated 2026-03-03. Based on RICE-IMPACT-MATRIX, PMM Strategy, Assumption Map, Competitor Signals, and Launch Readiness Assessment.*
