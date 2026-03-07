# RICE Prioritisation — Qualia Coding

**Date:** 2026-03-03
**Context:** Solo developer, free Obsidian plugin, pre-community-listing, academic niche.
**Sources:** ROADMAP.md (20 items), Gap Analysis (9 NEW gaps), PMM Strategy, Assumption Map, Competitor Signals.

---

## Adapted RICE Definitions

Standard RICE assumes DAU/MAU data and multi-person teams. Adapted for Qualia's context:

| Dimension | Definition | Scale |
|-----------|-----------|-------|
| **Reach** | % of target user base affected per quarter. Target = Obsidian-using qualitative researchers (~estimate 2,000-5,000 potential users year 1). | 1-10 scale: 10=100% of users, 5=50%, 1=10% |
| **Impact** | Effect on primary metric (installs + retention + academic credibility). | 3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal |
| **Confidence** | How certain are we about R and I estimates? Informed by Assumption Map CRITICAL flags. | 100%=high, 80%=medium, 50%=low, 30%=guess |
| **Effort** | Developer-weeks (solo). Includes design, implementation, testing, documentation. | Actual weeks of focused work |

**RICE Score** = (Reach x Impact x Confidence) / Effort

---

## Full RICE Scoring

### Tier A: Distribution & Infrastructure

| # | Initiative | Reach | Impact | Confidence | Effort (wks) | RICE Score | Category |
|---|-----------|:-----:|:------:|:----------:|:------------:|:----------:|----------|
| G18 | **Community Plugin Listing** | 10 | 3 | 80% | 3 | **8.0** | Distribution |
| R1 | **Code Hierarchy (parentId)** | 7 | 1 | 100% | 1.5 | **4.7** | Quick Win |
| R5 | **FuzzySuggestModal** | 6 | 0.5 | 100% | 0.5 | **6.0** | Quick Win |
| R7 | **Toggle Visibility per Code** | 5 | 0.5 | 100% | 1 | **2.5** | Quick Win |

### Tier B: Strategic Features (HIGH from Gap Analysis)

| # | Initiative | Reach | Impact | Confidence | Effort (wks) | RICE Score | Category |
|---|-----------|:-----:|:------:|:----------:|:------------:|:----------:|----------|
| G14 | **AI-Assisted Coding** | 8 | 3 | 50% | 8 | **1.5** | Moonshot |
| G15 | **Intercoder Reliability** | 5 | 2 | 50% | 6 | **0.8** | Strategic |
| R16 | **REFI-QDA Export** | 4 | 2 | 80% | 4 | **1.6** | Strategic |
| R19 | **Case Variables** | 4 | 1 | 80% | 3 | **1.1** | Strategic |

### Tier C: Medium Priority Enhancements

| # | Initiative | Reach | Impact | Confidence | Effort (wks) | RICE Score | Category |
|---|-----------|:-----:|:------:|:----------:|:------------:|:----------:|----------|
| R3 | **Memo Universal** | 6 | 1 | 100% | 1.5 | **4.0** | Enhancement |
| R4 | **Code → Theme Grouping** | 4 | 0.5 | 80% | 1.5 | **1.1** | Enhancement |
| R6 | **Quick Switcher (Cmd+Shift+C)** | 5 | 0.5 | 100% | 0.5 | **5.0** | Quick Win |
| R8 | **Cross-source Comparison** | 3 | 1 | 80% | 3 | **0.8** | Enhancement |
| R9 | **Code x Metadata** | 3 | 1 | 80% | 3 | **0.8** | Enhancement |
| R10 | **Code Overlap Analysis** | 2 | 0.5 | 80% | 2 | **0.4** | Enhancement |
| R11 | **Margin Panel Customization** | 3 | 0.25 | 100% | 1 | **0.75** | Polish |
| R12 | **Research Board Enhancements** | 3 | 0.5 | 80% | 3 | **0.4** | Enhancement |
| R20 | **Analytical Memos** | 4 | 0.5 | 80% | 2 | **0.8** | Enhancement |

### Tier D: Low Priority / Long-term

| # | Initiative | Reach | Impact | Confidence | Effort (wks) | RICE Score | Category |
|---|-----------|:-----:|:------:|:----------:|:------------:|:----------:|----------|
| R2 | **Parquet Evolution** (lazy loading, pagination) | 1 | 0.5 | 50% | 4 | **0.06** | Niche |
| R13 | **Projects + Workspace** | 3 | 2 | 30% | 12 | **0.15** | Moonshot |
| R14 | **Magnitude Coding** | 2 | 0.25 | 80% | 1.5 | **0.27** | Niche |
| R15 | **Leaf View Layout** | 2 | 0.5 | 30% | 8 | **0.04** | Moonshot |
| R17 | **Per-Code Decorations Phase 3** | 3 | 0.5 | 80% | 3 | **0.4** | Enhancement |
| R18 | **Margin Panel Resize Handle** | 2 | 0.25 | 80% | 1 | **0.4** | Polish |
| G16 | **Built-in Transcription** | 3 | 1 | 30% | 6 | **0.15** | Moonshot |
| G17 | **Collaboration** | 2 | 1 | 30% | 12 | **0.05** | Moonshot |
| G19 | **Methodology Templates** | 3 | 0.5 | 50% | 2 | **0.38** | Enhancement |
| G20 | **Undo/Redo for Coding** | 4 | 0.5 | 50% | 4 | **0.25** | Enhancement |
| G21 | **Survey Data Import** | 1 | 0.25 | 50% | 2 | **0.06** | Niche |
| G22 | **Multi-Language NLP** | 2 | 0.25 | 80% | 2 | **0.2** | Niche |

### Content & Community Initiatives

| # | Initiative | Reach | Impact | Confidence | Effort (wks) | RICE Score | Category |
|---|-----------|:-----:|:------:|:----------:|:------------:|:----------:|----------|
| C1 | **Demo Video (5 min)** | 8 | 2 | 80% | 1 | **12.8** | Content |
| C2 | **Sample Vault** | 6 | 1 | 80% | 1 | **4.8** | Content |
| C3 | **Tutorial Series (7 videos)** | 6 | 2 | 80% | 7 | **1.4** | Content |
| C4 | **Methods Paper (FQS/TQR)** | 3 | 2 | 50% | 4 | **0.75** | Credibility |
| C5 | **MMIRA 2026 Abstract** | 2 | 1 | 80% | 0.5 | **3.2** | Credibility |
| C6 | **Email CAQDAS Networking Project** | 2 | 2 | 50% | 0.25 | **8.0** | Credibility |

---

## Ranked by RICE Score

| Rank | Initiative | RICE | Effort | Category | Flag |
|:----:|-----------|:----:|:------:|----------|------|
| 1 | **Demo Video (5 min)** | **12.8** | 1 wk | Content | QUICK WIN |
| 2 | **Community Plugin Listing** | **8.0** | 3 wks | Distribution | #1 PRIORITY |
| 3 | **Email CAQDAS Networking Project** | **8.0** | 0.25 wk | Credibility | QUICK WIN |
| 4 | **FuzzySuggestModal** | **6.0** | 0.5 wk | Quick Win | QUICK WIN |
| 5 | **Quick Switcher** | **5.0** | 0.5 wk | Quick Win | QUICK WIN |
| 6 | **Sample Vault** | **4.8** | 1 wk | Content | QUICK WIN |
| 7 | **Code Hierarchy** | **4.7** | 1.5 wks | Quick Win | READY (plan complete) |
| 8 | **Memo Universal** | **4.0** | 1.5 wks | Enhancement | |
| 9 | **MMIRA Abstract** | **3.2** | 0.5 wk | Credibility | DEADLINE Mar 31 |
| 10 | **Toggle Visibility** | **2.5** | 1 wk | Quick Win | |
| 11 | **REFI-QDA Export** | **1.6** | 4 wks | Strategic | |
| 12 | **AI-Assisted Coding** | **1.5** | 8 wks | Moonshot | WINNING 62/70 |
| 13 | **Tutorial Series** | **1.4** | 7 wks | Content | |
| 14 | **Code → Theme** | **1.1** | 1.5 wks | Enhancement | |
| 15 | **Case Variables** | **1.1** | 3 wks | Strategic | |
| 16 | **Cross-source Comparison** | **0.8** | 3 wks | Enhancement | |
| 17 | **Code x Metadata** | **0.8** | 3 wks | Enhancement | |
| 18 | **Analytical Memos** | **0.8** | 2 wks | Enhancement | |
| 19 | **ICR (Intercoder Reliability)** | **0.8** | 6 wks | Strategic | WINNING 44/70 |
| 20 | **Methods Paper** | **0.75** | 4 wks | Credibility | |
| 21 | **Margin Customization** | **0.75** | 1 wk | Polish | |
| 22 | **Research Board Enhancements** | **0.4** | 3 wks | Enhancement | |
| 23 | **Per-Code Decorations Ph3** | **0.4** | 3 wks | Enhancement | |
| 24 | **Resize Handle** | **0.4** | 1 wk | Polish | |
| 25 | **Methodology Templates** | **0.38** | 2 wks | Enhancement | |
| 26 | **Magnitude Coding** | **0.27** | 1.5 wks | Niche | |
| 27 | **Undo/Redo** | **0.25** | 4 wks | Enhancement | |
| 28 | **Multi-Language NLP** | **0.2** | 2 wks | Niche | |
| 29 | **Projects + Workspace** | **0.15** | 12 wks | Moonshot | |
| 30 | **Transcription** | **0.15** | 6 wks | Moonshot | |
| 31 | **Parquet Evolution** | **0.06** | 4 wks | Niche | |
| 32 | **Survey Import** | **0.06** | 2 wks | Niche | |
| 33 | **Leaf View Layout** | **0.04** | 8 wks | Moonshot | |
| 34 | **Collaboration** | **0.05** | 12 wks | Moonshot | |

---

## Key Insights

### RICE vs WINNING: Where They Agree and Disagree

| Initiative | WINNING | RICE Rank | Agreement? |
|-----------|:-------:|:---------:|:----------:|
| AI-Assisted Coding | 62/70 (#1) | #12 | **DISAGREE** |
| Community Plugin Listing | 45/70 (#2) | #2 | Agree |
| Intercoder Reliability | 44/70 (#3) | #19 | **DISAGREE** |

**Why the disagreement:** WINNING scores strategic importance (pain, timing, fit, moat, growth). RICE scores execution efficiency (reach per effort). AI Coding and ICR score high on WINNING because they're strategically important — but they score low on RICE because they require massive effort (8 and 6 weeks) with uncertainty (50% confidence).

**The resolution:** WINNING tells you **what matters most**. RICE tells you **what to do first**. The optimal sequence is:
1. Do the quick wins that RICE surfaces (listing, demo video, fuzzy modal, quick switcher)
2. Then invest in the WINNING priorities (AI, ICR) with the credibility and distribution foundation already in place

### Quick Wins (High RICE, Low Effort)

| Initiative | RICE | Effort | Why it's a quick win |
|-----------|:----:|:------:|---------------------|
| Demo Video | 12.8 | 1 wk | Script already written. Highest ROI content asset. |
| Email CAQDAS Networking | 8.0 | 0.25 wk | Template already written. One email, massive credibility upside. |
| FuzzySuggestModal | 6.0 | 0.5 wk | ~30 LOC, stub exists. Instant UX improvement. |
| Quick Switcher | 5.0 | 0.5 wk | ~30 LOC. Power user delight. |
| Sample Vault | 4.8 | 1 wk | Enables tutorials, demo video, and onboarding. |
| MMIRA Abstract | 3.2 | 0.5 wk | Template already written. Deadline March 31. |

**Total quick wins:** 6 items, ~4 weeks, combined RICE 38.8. These alone would more than double Qualia's readiness for launch.

### Moonshots (High WINNING, Low RICE)

| Initiative | WINNING | RICE | Effort | Why RICE is low |
|-----------|:-------:|:----:|:------:|----------------|
| AI-Assisted Coding | 62/70 | 1.5 | 8 wks | 50% confidence (feasibility unknown), high effort |
| ICR | 44/70 | 0.8 | 6 wks | 50% confidence (data model dependency), high effort |
| Projects + Workspace | N/A | 0.15 | 12 wks | Massive scope, 30% confidence, blocks on other decisions |

**Recommendation:** Don't start moonshots until quick wins and listing are done. Reduce moonshot risk with technical spikes (1-week investigation) before committing to full implementation.

### Dependencies That Affect Sequencing

```
Community Listing ──→ ALL content (tutorials, demo, outreach)
                      (no point marketing an invisible plugin)

Code Hierarchy ──→ Theme Grouping (#4)
                   (parentId must exist before theme layer)

Case Variables (#19) ──→ Code x Metadata (#9)
                         (metadata fields must exist before crossing with codes)

Projects + Workspace (#13) ──→ ICR (#G15) [MAYBE]
                                (coderId may need Projects data model)
                              ──→ Leaf View (#15)
                                (layout assumes Projects exist)

REFI-QDA Export (#16) ──→ Migration funnel from incumbents
                          (enables "bring your NVivo project" narrative)
```

---

## Recommended Sequence (6-Month Plan)

### Month 1: Quick Wins + Listing Prep (RICE 38.8 total)

| Week | Initiative | RICE | Effort |
|:----:|-----------|:----:|:------:|
| 1 | FuzzySuggestModal + Quick Switcher | 11.0 | 1 wk |
| 1 | MMIRA Abstract submission | 3.2 | 0.5 wk |
| 1 | Email CAQDAS Networking Project | 8.0 | 0.25 wk |
| 2 | Code Hierarchy | 4.7 | 1.5 wks |
| 3 | Demo Video | 12.8 | 1 wk |
| 3-4 | Community Plugin Listing (prep + submit) | 8.0 | 2 wks |

**Output:** 3 quick-win features shipped, demo video recorded, listing submitted, MMIRA abstract sent, CAQDAS Project contacted. Total: ~6 weeks of work.

### Month 2: Stabilize + Content Foundation

| Week | Initiative | RICE | Effort |
|:----:|-----------|:----:|:------:|
| 5 | Sample Vault | 4.8 | 1 wk |
| 5-6 | Memo Universal | 4.0 | 1.5 wks |
| 6-7 | Toggle Visibility | 2.5 | 1 wk |
| 7-8 | Tutorial videos 1-3 (of 7) | ~0.6 each | 3 wks |

**Output:** Sample vault live, 2 more features shipped, first 3 tutorials published.

### Month 3-4: AI Coding Technical Spike + REFI-QDA

| Week | Initiative | RICE | Effort |
|:----:|-----------|:----:|:------:|
| 9 | AI-Assisted Coding — **spike only** (Ollama test) | — | 1 wk |
| 10-13 | REFI-QDA Export (text markers first) | 1.6 | 4 wks |
| — | Decision: proceed with AI full build or pivot? | — | — |

**Output:** REFI-QDA export (enables migration narrative), AI feasibility confirmed or pivoted.

### Month 5-6: AI Coding or ICR (pick ONE based on spike results)

| If AI spike succeeds | If AI spike fails |
|---------------------|-------------------|
| AI-Assisted Coding full build (6-7 wks) | Intercoder Reliability (6 wks) |
| Ship AI as differentiator | Ship ICR as credibility enabler |
| ICR moves to month 7-8 | AI revisited with different approach |

**Output:** One major strategic feature shipped. Methods paper submission begins.

---

## Data Gaps That Would Improve Scoring

| Data needed | Improves scoring for | How to get it |
|------------|---------------------|--------------|
| **Quadro download count** | Community Listing reach estimate | Check Obsidian stats API |
| **Obsidian QDA user survey** | All Reach estimates | Survey on r/qualitativeresearch |
| **Ollama latency test** | AI-Assisted Coding confidence | Technical spike (1 week) |
| **ICR architecture review** | ICR confidence + effort | Architecture review (1 day) |
| **QualCoder/Taguette growth rate** | GTM reach targets | Check GitHub stars over time |
| **Obsidian plugin review guidelines** | Listing confidence | Read docs + ask in Discord |

---

## RICE vs Other Frameworks Used

| Framework | Best for | Used in |
|-----------|---------|---------|
| **RICE** (this doc) | Execution priority — what to build FIRST | Sprint planning |
| **WINNING** (gap analysis) | Strategic importance — what MATTERS most | Roadmap direction |
| **Assumption Map** | Risk — what could make us WRONG | Validation planning |
| **Competitor Signals** | Market urgency — what's happening NOW | Timing decisions |

All four frameworks converge on: **listing first, then quick wins, then AI coding, with REFI-QDA as a bridge.**

---

*Scoring performed 2026-03-03. Solo developer context: Effort in developer-weeks, Reach scaled to estimated potential user base (2,000-5,000 year 1). Confidence informed by Assumption Map CRITICAL flags.*
