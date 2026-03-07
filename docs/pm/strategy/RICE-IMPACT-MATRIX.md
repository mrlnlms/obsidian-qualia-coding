# RICE + Strategic Alignment Matrix — Qualia Coding

**Date:** 2026-03-03
**Method:** RICE scores (from RICE-PRIORITISATION.md) + Strategic Alignment scoring against 3 current OKRs.

---

## Current Strategic Priorities (OKRs)

Derived from PMM Strategy §7 and Competitor Signals:

| # | OKR | Weight | Rationale |
|---|-----|:------:|-----------|
| **O1** | **Get discoverable** — community listing, README, demo, visibility | Top | Without distribution, nothing else matters |
| **O2** | **Close credibility gaps** — features that make Qualia recommendable for academic research (AI, ICR, REFI-QDA) | High | Competitor signals show AI is table stakes; ICR is academic blocker |
| **O3** | **Deepen product quality** — UX polish, missing basics, stability for real-world use | Medium | Assumption Map flags trust as CRITICAL; product quality builds trust |

## Strategic Alignment Scoring

| Score | Meaning |
|:-----:|---------|
| +3 | Directly supports top OKR (O1: discoverability) |
| +2 | Supports high OKR (O2: credibility gaps) |
| +1 | Supports medium OKR (O3: product quality) |
| 0 | Neutral — nice to have but doesn't advance any OKR |
| -1 | Contradicts strategic direction (scope creep, premature complexity) |

## Combined Score

**Combined Score = RICE Score + (Strategic Alignment × Weight)**

Where weight: O1 = ×4, O2 = ×3, O3 = ×2 (reflects priority ordering)

---

## Priority Matrix

| # | Initiative | RICE | Alignment | Aligned OKR | Combined | Quadrant |
|---|-----------|:----:|:---------:|:-----------:|:--------:|:--------:|
| C1 | **Demo Video** | 12.8 | +3 | O1 | **24.8** | **NOW** |
| G18 | **Community Plugin Listing** | 8.0 | +3 | O1 | **20.0** | **NOW** |
| C6 | **Email CAQDAS Networking** | 8.0 | +3 | O1 | **20.0** | **NOW** |
| R5 | **FuzzySuggestModal** | 6.0 | +1 | O3 | **8.0** | **NOW** |
| R1 | **Code Hierarchy** | 4.7 | +1 | O3 | **6.7** | **NOW** |
| C5 | **MMIRA Abstract** | 3.2 | +2 | O2 | **9.2** | **NOW** |
| R6 | **Quick Switcher** | 5.0 | +1 | O3 | **7.0** | **NOW** |
| C2 | **Sample Vault** | 4.8 | +3 | O1 | **16.8** | **NOW** |
| G14 | **AI-Assisted Coding** | 1.5 | +2 | O2 | **7.5** | **NEXT** |
| R16 | **REFI-QDA Export** | 1.6 | +2 | O2 | **7.6** | **NEXT** |
| R3 | **Memo Universal** | 4.0 | +1 | O3 | **6.0** | **NEXT** |
| R7 | **Toggle Visibility** | 2.5 | +1 | O3 | **4.5** | **NEXT** |
| G15 | **ICR** | 0.8 | +2 | O2 | **6.8** | **NEXT** |
| C3 | **Tutorial Series** | 1.4 | +3 | O1 | **13.4** | **NEXT** |
| R19 | **Case Variables** | 1.1 | +2 | O2 | **7.1** | **NEXT** |
| R20 | **Analytical Memos** | 0.8 | +1 | O3 | **2.8** | **LATER** |
| R4 | **Code → Theme** | 1.1 | +1 | O3 | **3.1** | **LATER** |
| C4 | **Methods Paper** | 0.75 | +2 | O2 | **6.75** | **LATER** |
| R8 | **Cross-source Comparison** | 0.8 | 0 | — | **0.8** | **LATER** |
| R9 | **Code x Metadata** | 0.8 | +1 | O3 | **2.8** | **LATER** |
| R11 | **Margin Customization** | 0.75 | 0 | — | **0.75** | **LATER** |
| R12 | **Research Board Enhancements** | 0.4 | 0 | — | **0.4** | **LATER** |
| R10 | **Code Overlap Analysis** | 0.4 | 0 | — | **0.4** | **LATER** |
| G19 | **Methodology Templates** | 0.38 | +1 | O3 | **2.38** | **LATER** |
| R17 | **Per-Code Decorations Ph3** | 0.4 | 0 | — | **0.4** | **LATER** |
| G20 | **Undo/Redo** | 0.25 | +1 | O3 | **2.25** | **LATER** |
| R18 | **Resize Handle** | 0.4 | 0 | — | **0.4** | **DROP** |
| R14 | **Magnitude Coding** | 0.27 | 0 | — | **0.27** | **DROP** |
| R2 | **Parquet Evolution** | 0.06 | 0 | — | **0.06** | **DROP** |
| G22 | **Multi-Language NLP** | 0.2 | 0 | — | **0.2** | **DROP** |
| G21 | **Survey Import** | 0.06 | 0 | — | **0.06** | **DROP** |
| R13 | **Projects + Workspace** | 0.15 | -1 | — | **-1.85** | **DROP** |
| R15 | **Leaf View Layout** | 0.04 | -1 | — | **-1.96** | **DROP** |
| G16 | **Transcription** | 0.15 | 0 | — | **0.15** | **DROP** |
| G17 | **Collaboration** | 0.05 | -1 | — | **-1.95** | **DROP** |

---

## Visual Matrix

```
                    STRATEGIC ALIGNMENT
           Low (0)        Medium (+1/+2)      High (+3)
         ┌──────────────┬──────────────────┬──────────────────┐
         │              │                  │                  │
   H     │              │   AI Coding      │  Demo Video      │
   i     │              │   REFI-QDA       │  Listing         │
   g     │              │   ICR            │  CAQDAS Email    │
   h     │              │   Case Vars      │  Sample Vault    │
         │              │   MMIRA Abstract │  Tutorial Series │
   R     │              │                  │                  │
   I     ├──────────────┼──────────────────┼──────────────────┤
   C     │              │                  │                  │
   E     │              │  FuzzyModal      │                  │
         │              │  Quick Switcher  │                  │
   M     │              │  Code Hierarchy  │                  │
   e     │              │  Memo Universal  │                  │
   d     │              │  Toggle Vis.     │                  │
         │              │  Code→Theme      │                  │
         ├──────────────┼──────────────────┼──────────────────┤
         │              │                  │                  │
   L     │ Resize       │  Undo/Redo       │                  │
   o     │ Magnitude    │  Meth. Templates │                  │
   w     │ Parquet Evo  │  Analytical Memo │  Methods Paper   │
         │ Multi-Lang   │  Code Overlap    │                  │
         │ Survey       │  Board Enhance   │                  │
         │ Leaf View    │  Cross-source    │                  │
         │ Collab       │  Per-Code Dec.   │                  │
         │ Transcription│  Code×Metadata   │                  │
         │ Projects     │                  │                  │
         └──────────────┴──────────────────┴──────────────────┘
              DROP             LATER              NOW/NEXT
```

---

## Quadrant Summary

### NOW (Do This Quarter) — 8 initiatives

| Initiative | Combined | Effort | Why NOW |
|-----------|:--------:|:------:|---------|
| **Demo Video** | 24.8 | 1 wk | Highest combined score. Script ready. Enables everything else. |
| **Community Plugin Listing** | 20.0 | 3 wks | Distribution bottleneck. Every week unlisted = Quadro wins. |
| **Email CAQDAS Networking** | 20.0 | 0.25 wk | One email, massive credibility upside. Template ready. |
| **Sample Vault** | 16.8 | 1 wk | Enables demo, tutorials, onboarding. High leverage. |
| **MMIRA Abstract** | 9.2 | 0.5 wk | Deadline Mar 31. Template ready. Low effort, credibility signal. |
| **FuzzySuggestModal** | 8.0 | 0.5 wk | ~30 LOC, stub exists. Ships before listing. |
| **Quick Switcher** | 7.0 | 0.5 wk | ~30 LOC. Ships before listing. |
| **Code Hierarchy** | 6.7 | 1.5 wks | Plan complete, ~200 LOC. Ships before listing. |

**Total NOW effort:** ~8.25 weeks. Fits in ~2 months for a solo developer.

### NEXT (Queue for Next Quarter) — 7 initiatives

| Initiative | Combined | Effort | When |
|-----------|:--------:|:------:|------|
| **Tutorial Series** | 13.4 | 7 wks | After listing (needs installs to justify) |
| **REFI-QDA Export** | 7.6 | 4 wks | After listing (enables migration narrative) |
| **AI-Assisted Coding** | 7.5 | 8 wks | After spike validates feasibility |
| **Case Variables** | 7.1 | 3 wks | After REFI-QDA (mixed methods narrative) |
| **ICR** | 6.8 | 6 wks | After AI coding or in parallel |
| **Memo Universal** | 6.0 | 1.5 wks | Quick enhancement between big features |
| **Toggle Visibility** | 4.5 | 1 wk | Quick enhancement between big features |

### LATER (Revisit When Capacity Allows) — 11 initiatives

Analytical Memos, Code→Theme, Methods Paper, Cross-source Comparison, Code×Metadata, Margin Customization, Research Board Enhancements, Code Overlap, Methodology Templates, Per-Code Decorations Ph3, Undo/Redo.

### DROP (Remove from Active Backlog) — 8 initiatives

| Initiative | Why DROP |
|-----------|---------|
| Resize Handle | Polish on a feature that works. Zero strategic value. |
| Magnitude Coding | Niche Saldaña feature. No user has asked for it. |
| Parquet Evolution | Current Parquet support is sufficient. No demand signal. |
| Multi-Language NLP | Secondary analytics feature. EN+PT is enough for now. |
| Survey Import | CSV/Parquet already covers this. No gap. |
| Projects + Workspace | Premature complexity. Contradicts "ship listing fast." 12 weeks. |
| Leaf View Layout | Depends on Projects. Double-blocked. |
| Collaboration | Architecture incompatible. No near-term path. |
| Transcription | External tools (Whisper) handle this. Out of scope. |

**DROP doesn't mean DELETE.** These stay in the ROADMAP.md as future possibilities. They just don't belong in active sprint planning for the next 6 months.

---

## Convergence Check: All Frameworks Agree

| Framework | #1 Action | #2 Action | #3 Action |
|-----------|-----------|-----------|-----------|
| **RICE** | Demo Video (12.8) | Listing (8.0) | CAQDAS Email (8.0) |
| **WINNING** | AI Coding (62/70) | Listing (45/70) | ICR (44/70) |
| **Assumption Map** | Validate capacity | Validate audience exists | AI spike |
| **Competitor Signals** | Listing (stop Quadro bleed) | AI (QualCoder shipped first) | CAQDAS credibility |
| **RICE+Alignment** | Demo Video (24.8) | Listing (20.0) | CAQDAS Email (20.0) |

**Universal consensus:** Listing is top 3 in every framework. Demo video is the highest-leverage single action. The only disagreement is AI timing — WINNING says urgent, RICE says after quick wins.

**The synthesis:** Ship quick wins (month 1) → list (month 1-2) → demo + sample vault (month 2) → AI spike (month 3) → AI or REFI-QDA build (months 3-5) → ICR (months 5-6).

---

## Final Recommended Sequence

```
MONTH 1                    MONTH 2                MONTHS 3-4              MONTHS 5-6
─────────────────────     ──────────────────     ──────────────────     ──────────────
FuzzyModal (0.5w)    ──→  Sample Vault (1w) ──→  AI Spike (1w)    ──→  AI Build OR
Quick Switcher (0.5w)     Memo Universal (1.5w)  REFI-QDA (4w)         ICR (6w)
Code Hierarchy (1.5w)     Toggle Vis. (1w)       Tutorial 1-3 (3w)     Tutorial 4-7
MMIRA Abstract (0.5w)     Tutorial Series                               Methods Paper
CAQDAS Email (0.25w)        begins                                       begins
Demo Video (1w)
Listing Submit (2w)
                           ↑ LISTING GOES LIVE
```

**Total active work:** ~28 weeks across 6 months = ~4.7 weeks/month. Sustainable for a solo developer with other commitments, IF the DROP items stay dropped.

---

*Matrix generated 2026-03-03. Combined RICE + Strategic Alignment scoring. OKRs derived from PMM Strategy, gap analysis, and competitor signals.*
