# QDAS Competitive Landscape

**Date**: 2026-03-03
**Product**: Qualia Coding (Obsidian plugin for qualitative data analysis)

---

## Market Overview

The QDAS market was valued at USD 1.2B (2024), projected to USD 1.9B by 2032. The market is bifurcating into:

1. **Traditional Academic QDAS** — NVivo, ATLAS.ti, MAXQDA (methodological rigor, institutional trust)
2. **AI-Native UX/Product Research** — Dovetail, Marvin, CoLoop, Looppanel (speed over rigor)
3. **Open Source / Free** — Taguette, QualCoder, qc, OpenQDA, Quadro (accessibility)
4. **PKM-Adjacent** — Quadro, Obsidian vault templates (research-as-knowledge-management)

**Critical event**: Lumivero (PE-backed) acquired ATLAS.ti in Sept 2024. They now own NVivo + ATLAS.ti — the two largest traditional QDAS tools. MAXQDA is the only independent big player left.

---

## Competitive Matrix — Traditional Big 3

| Dimension | NVivo | ATLAS.ti | MAXQDA | **Qualia Coding** |
|-----------|-------|----------|--------|-------------------|
| **Owner** | Lumivero (PE) | Lumivero (PE) | VERBI (family) | Independent |
| **Age** | 25+ yrs | 30+ yrs | 35+ yrs | New |
| **Pricing** | $118-1,800/yr | $51-670 | €253-1,440/yr | Free |
| **Platforms** | Win + Mac | Win + Mac + Web + Mobile | Win + Mac | Obsidian (all OS) |
| **Learning curve** | Steep | Moderate | Gentlest | TBD |
| **Mixed methods** | Strong | Moderate | **Best-in-class** | CSV/Parquet + Analytics |
| **AI features** | Conservative (summaries, autocoding) | All-in (coding, transcription, chat, sentiment) | Add-on (€120/yr) | Not yet |
| **Collaboration** | Cloud (unreliable) | Web (real-time) | TeamCloud (add-on) | Not yet |
| **Video/Image coding** | Transcript-based | Direct video coding | Transcript-based | **Fabric.js + WaveSurfer** |
| **PDF handling** | "Mediocre" | Standard | Standard | **Per-code opacity blending** |
| **Structured data** | No | No | No | **CSV + Parquet** |
| **PKM integration** | None | None | None | **Native Obsidian** |
| **Data integrity** | OK | **Data loss reports** | OK | File-based (Markdown) |
| **Performance at scale** | Degrades 70+ sources | Degrades large projects | OK | Plugin architecture |
| **G2 Rating** | ~4.1/5 | ~4.5/5 | ~4.5+/5 | N/A |
| **Intercoder reliability** | Yes | Yes | Yes (Kappa) | Not yet |
| **REFI-QDA** | Import/Export | Import/Export | Import/Export | Not yet |

---

## Competitor Profiles

### Tier 1 — Traditional Desktop QDAS (The Big 3)

#### NVivo (Lumivero)
- **Threat**: Medium
- **Pricing**: $118/yr (student) to $1,800+ (commercial perpetual)
- **Strengths**: Institutional lock-in, most-cited QDA in publications, Framework Matrix (unique), 8+ methodology templates, built-in transcription (40+ languages)
- **Weaknesses**: Desktop-only, PDF handling "mediocre", degrades at 70+ sources/100+ codes, Collaboration Cloud "catastrophic" sync failures, poor customer support, dated ribbon UI
- **AI**: Conservative — summaries, suggested codes, autocoding, admin kill switches for IRB compliance
- **Direction**: PE roll-up strategy (NVivo + ATLAS.ti), cautious AI, SaaS signals but no web product yet
- **Key vulnerability**: Architectural limitations require ground-up rebuild that PE ownership disincentivizes
- **[Full profile →](nvivo.md)**

#### ATLAS.ti (Lumivero)
- **Threat**: Low-Medium
- **Pricing**: $51/yr (student) to $670 perpetual; Cloud $5-30/mo
- **Strengths**: Quotation-centric data model (unique), best-in-class network views, cross-platform (Win/Mac/Web/Mobile), grounded theory workflow, widest AI feature set in QDAS
- **Weaknesses**: Data loss reports (~80% quotations disappearing), 10-15s per code application at scale, token-metered AI (artificial scarcity), misleading trial (500-word cap), no hotkey customization, closed ecosystem
- **AI**: All-in — transcription (30+ languages), AI coding, conversational AI, sentiment analysis. All OpenAI-dependent, token-metered
- **Direction**: AI everything, cloud-first, post-acquisition integration slowing releases (3 in 14 months)
- **Key vulnerability**: Data integrity concerns are devastating for a research tool; OpenAI dependency creates privacy issues
- **[Full profile →](atlas-ti.md)**

#### MAXQDA (VERBI Software)
- **Threat**: HIGH — most direct competitor
- **Pricing**: ~€253/yr (academic) to €1,440 (business 3-yr)
- **Strengths**: Mixed methods gold standard, 20+ interactive visualizations, built-in statistics (Analytics Pro), gentlest learning curve, excellent support, true Mac/Win parity, 35-yr trust, REFI-QDA support
- **Weaknesses**: Desktop-only, collaboration is paid bolt-on, AI paywalled (€120/yr add-on), subscription transition friction, video coding transcript-centric, no Linux, small team (~62)
- **AI**: AI Assist (summaries, subcodes, chat with docs) — separate purchase. Multi-document AI coding added Feb 2026
- **Direction**: Cloud investment (DevOps hiring), subscription model, AI as upsell, continuous releases
- **Key vulnerability**: Video/image coding is secondary to text; no CSV/Parquet; desktop-only architecture
- **[Full profile →](maxqda.md)**

---

### Tier 2 — Web-Based / Cloud-Native

#### Dedoose
- **Pricing**: Pay-as-you-go per user/month
- **Differentiator**: True mixed-methods (qual + quant in one), cloud collaboration as core
- **Weakness**: Dated interface, web-only (no offline)
- **Relevance**: Mixed-methods model for Qualia's CSV/Analytics engines

#### Delve
- **Pricing**: Monthly subscription (pay per month of use)
- **Differentiator**: Intercoder reliability tracking, clean modern UX
- **Weakness**: Interview-focused only
- **Relevance**: Intercoder reliability is a methodological standard Qualia doesn't yet address

#### Dovetail
- **Pricing**: From $15/mo; enterprise custom
- **Differentiator**: AI-powered research repository, auto-transcription, "Channels" for continuous theme classification, deep integrations (Slack, Salesforce, Zoom, Jira, Notion)
- **Target**: Mid-market to enterprise product/UX teams (not academic)
- **Relevance**: Shows where industry is heading — continuous classification, integration ecosystems

#### Condens
- **Pricing**: Subscription (tiered)
- **Differentiator**: Human-driven analysis philosophy (anti-AI-first), strong research repository
- **Relevance**: Philosophy aligns with academic QDAS values where researcher agency matters

---

### Tier 3 — AI-Native / AI-First

#### Marvin (HeyMarvin)
- **Differentiator**: AI-native end-to-end research pipeline, automatic note-taking
- **Target**: Product teams wanting speed over methodological rigor

#### CoLoop
- **Differentiator**: End-to-end AI analysis flow (record → synthesize → analyze)
- **Target**: Product and research teams wanting accelerated insights

#### Looppanel
- **Differentiator**: AI auto-tagging, claims 80% reduction in analysis time
- **Relevance**: Auto-tagging is a concrete AI-assist feature adaptable for Qualia's coding popover

#### Usercall
- **Differentiator**: AI agents that moderate user interviews autonomously
- **Relevance**: Shows market expectations for automated code suggestion

#### Quals AI
- **Differentiator**: "Brief to insights in 24 hours" — speed-first
- **Target**: Market researchers, agencies (minimal overlap with academic QDAS)

#### Sopact
- **Differentiator**: AI-native for social impact measurement
- **Target**: NGOs, program evaluation (niche)

---

### Tier 4 — Open Source / Free

#### Taguette
- **URL**: taguette.org
- **Stack**: Python + React
- **Pricing**: Free, open-source (FOSS)
- **Differentiator**: Extremely simple text tagging; local, self-hosted, or free server; real-time collaboration on server mode; imports PDF, DOCX, TXT, HTML, EPUB, ODT, RTF
- **Weakness**: Text-only, no multimedia, no visual analytics, no rich coding features
- **Relevance**: **Direct competitor in "free qualitative coding" space.** Qualia's 7-engine architecture vastly exceeds scope. But Taguette's zero-install web version lowers barrier significantly.

#### QualCoder
- **URL**: qualcoder.wordpress.com
- **Stack**: Python + Qt
- **Pricing**: Free, open-source (FOSS)
- **Differentiator**: Supports text AND image coding; tree-like code hierarchies; **AI-assisted coding and AI chat (v3.6-3.7, 2025)** with multi-model support
- **Weakness**: Desktop-only, Python-based (heavier install), traditional interface
- **Relevance**: **Most feature-comparable open-source competitor.** AI-assisted coding addition signals even FOSS QDAS is moving to AI. Does not match Qualia's audio/video coding depth.

#### qc (qualitative-coding)
- **Stack**: Python CLI
- **Differentiator**: Focus on "computational thinking" — code-as-code approach for qualitative analysis
- **Weakness**: No UI, terminal-only — very niche audience
- **Relevance**: Shows demand for programmer-friendly QDA. Obsidian users may overlap with this technical audience.

#### OpenQDA
- **URL**: openqda.org (est.)
- **Stack**: PHP + plugins
- **Differentiator**: Collaborative, extensible plugin architecture, **REFI-QDA support**
- **Weakness**: Early access, still in construction
- **Relevance**: The only open-source QDAS with plugin architecture. REFI-QDA support is notable for interoperability. Watch as it matures.

---

### Tier 5 — PKM-Adjacent / Obsidian Ecosystem

#### Quadro (Obsidian Plugin) — **Most Direct Competitor**
- **URL**: github.com/chrisgrieser/obsidian-quadro
- **Pricing**: Free, open-source
- **Differentiator**: QDA inside Obsidian using Markdown; supports Grounded Theory and Qualitative Content Analysis; bidirectional links between Data files and Code files; leverages Graph View
- **Weakness**: **Text-only (Markdown)**; no multimedia; no visual analytics; no per-code decorations; no coding popover
- **Relevance**: Listed in official Obsidian community plugin directory. Lightweight and Markdown-native. But Qualia's 7-engine multimedia support is a decisive differentiator.

| Dimension | Quadro | Qualia Coding |
|-----------|--------|---------------|
| Data types | Markdown only | MD, PDF, CSV, Image, Audio, Video, Analytics |
| Coding UX | Obsidian links | Dedicated popover + decorations |
| Visualization | Obsidian Graph View | 17 analytics ViewModes + Research Board |
| Bundle size | Tiny | ~2.1 MB |
| Community listing | Yes | Not yet |

#### Obsidian QDA Environment (Ryan Murphy)
- A preconfigured vault template (not a plugin). Proof-of-concept showing demand for QDA in Obsidian.

#### Integrated QDA Environment (Fulcra Design)
- Conceptual framework/methodology guide. Validates Obsidian as viable QDA platform.

---

### Tier 6 — Visual Workflow Tools (Non-QDA but Relevant)

#### Orange
- **Stack**: Python + Qt
- **Why relevant**: Node-based visual programming for data analysis, didactic. Could inspire visual workflow features in Qualia Analytics.

#### KNIME
- **Stack**: Java + Python/R nodes
- **Why relevant**: Enterprise-grade, scalable, integrates with everything. Shows what serious analytical pipeline UX looks like.

#### n8n / Node-RED
- **Stack**: Node.js
- **Why relevant**: Automation visual flows, declarative. Could inspire automated coding pipelines or data ingestion workflows.

---

## Interoperability Standards

### REFI-QDA (Research Exchange Format for Qualitative Data Analysis)
- **Description**: Emerging standard for exchanging projects between MAXQDA, NVivo, ATLAS.ti, and open-source tools
- **Support**: MAXQDA (full), NVivo (full), ATLAS.ti (full), OpenQDA (planned), QualCoder (partial)
- **Qualia Coding status**: Not yet implemented
- **Priority**: Medium-High — enables migration from incumbent tools and positions Qualia as a serious player in the ecosystem. Users locked into NVivo/MAXQDA could import projects.

---

## Strategic Positioning Map

```
                    AI-Heavy
                       ↑
                       │
          Marvin  CoLoop  Looppanel
                       │
            ATLAS.ti ──┤
                       │
             NVivo ────┤── MAXQDA
                       │
                       │          ◆ Qualia Coding
                       │          (target position: PKM + multimedia)
                       │
    Taguette ──────────┤── QualCoder
                       │
                    Manual
        ←──────────────┼──────────────→
     Standalone                    Integrated/PKM
                       │
                   Quadro ─────→ (Obsidian native)
```

---

## Gap Analysis — Where Qualia Coding Wins

### Unmatched Advantages (No Competitor Has These Together)
1. **7-engine multimedia coding inside Obsidian** — no tool combines MD, PDF, CSV, Image, Audio, Video, Analytics in a PKM context
2. **Fabric.js visual coding** — superior image coding UX vs transcript-based approaches
3. **WaveSurfer audio/video** — richer than any open-source competitor
4. **CSV + Parquet coding** — unique capability, no QDAS offers structured data as a coding surface
5. **Per-code opacity blending in PDF** — unique PDF decoration approach
6. **Free inside existing workflow** — zero additional cost, zero context switching
7. **File-based storage** — inherently more resilient than proprietary databases (ATLAS.ti data loss)

### Critical Gaps to Address
| Gap | Why It Matters | Who Has It |
|-----|---------------|------------|
| **AI-assisted coding** | Becoming table stakes (even QualCoder added it in 2025) | ATLAS.ti, MAXQDA, QualCoder, all AI-native tools |
| **Intercoder reliability** | Academic methodological requirement | NVivo, MAXQDA, ATLAS.ti, Delve, Dedoose |
| **REFI-QDA import/export** | Enables migration from incumbents | MAXQDA, NVivo, ATLAS.ti, OpenQDA |
| **Collaboration** | Expected for team research | Dedoose, ATLAS.ti (web), MAXQDA (TeamCloud), Taguette (server) |
| **Community plugin listing** | Discovery and trust | Quadro is listed; Qualia is not yet |

### Opportunities from Competitor Weaknesses
| Weakness | Who | Qualia's Counter |
|----------|-----|-----------------|
| Desktop-only | NVivo, MAXQDA | Obsidian runs everywhere (Electron) |
| Poor PDF handling | NVivo | 7-engine PDF with per-code blending |
| Data loss | ATLAS.ti | File-based Markdown storage |
| Token-metered AI | ATLAS.ti | Future: local-first AI (no cloud dependency) |
| Text-only | Taguette, Quadro | 7 multimedia engines |
| Expensive | NVivo ($1,800), MAXQDA (€1,440) | Free |
| Closed ecosystem | NVivo, ATLAS.ti | Obsidian plugin ecosystem |
| PE consolidation risk | NVivo + ATLAS.ti | Independent |

---

## Recommended Strategic Priorities

1. **AI-assisted coding** — #1 gap. Market expects it. Local-first approach (no cloud/token limits) would be a differentiator vs ATLAS.ti/MAXQDA.

2. **REFI-QDA support** — enables migration funnel from NVivo/MAXQDA/ATLAS.ti. Researchers can "try" Qualia with existing projects.

3. **Obsidian community plugin listing** — essential for discovery. Quadro is already there.

4. **Intercoder reliability** — academic credibility requirement. Without it, Qualia is perceived as a "toy" by methods committees.

5. **Collaboration story** — even a basic "export/import project" or Obsidian Sync integration would address the gap.

---

## Sources

- Lumivero (NVivo): lumivero.com, G2, Capterra reviews
- ATLAS.ti: atlasti.com, G2, Capterra, Software Advice reviews
- MAXQDA: maxqda.com, G2, Capterra reviews, job postings
- Market data: 6sense, Growjo, industry reports
- Open source: respective GitHub repos and project sites
- PKM/Obsidian: GitHub repos, Fulcra Design, community forums

*Individual competitor profiles available in this directory.*
