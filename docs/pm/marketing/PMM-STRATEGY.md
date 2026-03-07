# Qualia Coding — Product Marketing Strategy

**Date:** 2026-03-03
**Author:** PMM analysis grounded in synthetic users research (Feb 2026), competitive landscape analysis, and mixed methods theoretical foundations.
**Method:** April Dunford positioning framework + PLG-only GTM.

---

## 1. POSITIONING (April Dunford Method)

### Step 1: Competitive Alternatives

Without Qualia Coding, target users would:

1. **Pay $500-1,800/yr for NVivo, ATLAS.ti, or MAXQDA** — the institutional default. Researchers get systematic coding across multiple data types, but inside a siloed desktop application disconnected from their thinking workflow. Data stays locked in proprietary project files.
2. **Use Quadro (Obsidian plugin)** — free, markdown-only, codes via wikilinks. Stays inside Obsidian but only handles text. No PDF, no images, no audio/video, no analytics.
3. **Use QualCoder** — free, open-source, handles text + image + audio + video. But it is a standalone Python/Qt application with no connection to knowledge management. No CSV/Parquet, no built-in analytics beyond frequency counts.
4. **Use Taguette** — free, text-only, minimal. Suitable for small student projects. No multimodal support.
5. **Do it manually** — highlight PDFs in one tool, tag images in another, code audio in a third, then manually compile in Obsidian. This is what Dr. Okonkwo described: "In Atlas.ti, I'm managing the project, the codes, the documents. In Obsidian, I'm just... thinking with the data." The gap between managing and thinking is the competitive alternative.

### Step 2: Unique Attributes

| # | Attribute | Who else has it? |
|---|-----------|-----------------|
| 1 | 7 data type engines in a single tool (MD, PDF, CSV, Image, Audio, Video, Analytics) | No single tool covers all 7. MAXQDA covers 5 (no CSV coding, no built-in analytics canvas). |
| 2 | Lives inside Obsidian — graph view, backlinks, community plugins, vault-based | Quadro (markdown-only). No CAQDAS tool integrates with a PKM system. |
| 3 | 5 exclusive analytics views: MCA Biplot, MDS Map, Lag Sequential Analysis, Polar Coordinates, CHAID Decision Tree | Zero competitors have these built-in. Researchers use R/SPSS separately. |
| 4 | Research Board (Fabric.js freeform canvas, 6 node types) | ATLAS.ti has a network view. No CAQDAS has a freeform research canvas with sticky notes, excerpts, KPI cards, and cluster frames. |
| 5 | CSV + Parquet coding | No QDA tool in the world codes Parquet files. CSV coding is unique to Qualia. |
| 6 | Per-code opacity blending in PDF and Markdown | No competitor. MAXQDA uses solid colors with margin bars. NVivo uses single-color highlights. |
| 7 | MAXQDA-style margin bars in open source | MAXQDA proprietary. No FOSS tool has margin bars. |
| 8 | Free, local-first, file-based (data.json) | QualCoder and Taguette are free. But neither is local-first in the Obsidian sense (vault-portable, sync-friendly, no database). |
| 9 | 28K LOC, 108 source files, single developer | Not a differentiator per se, but signals depth vs. toy plugins. |

### Step 3: Attribute to Value Mapping

| Attribute | Value to user |
|-----------|--------------|
| 7 engines in one tool | No tool-switching tax. Code a PDF, jump to a CSV, check an image — same codes, same sidebar, same workflow. Eliminates the "bricoleur's tax" of assembling multiple tools. |
| Inside Obsidian | Coding happens where thinking already happens. Graph view reveals code-to-note relationships that linear CAQDAS cannot surface. "When those connections start to pop out, it's like a small jolt of electricity" (Dr. Okonkwo). |
| 5 exclusive analytics | Mixed methods researchers can do quantitization (qual-to-quant) inside the same tool — MCA, MDS, Lag Sequential, Polar Coordinates, CHAID — without exporting to R or SPSS. This is the "crossover mixed analysis" vision (Onwuegbuzie): 1+1=1. |
| Research Board | Visual synthesis space. Researchers can arrange excerpts, snapshots, and KPI cards on a freeform canvas — the "thinking wall" that connects systematic coding to emergent insight. |
| CSV + Parquet | Quantitative datasets become codable. A health researcher can code patient survey responses (CSV) alongside interview transcripts (MD) and clinical images — true mixed methods in one workspace. |
| Per-code opacity blending | Overlapping codes are visible, not hidden. When three codes overlap on a paragraph, all three colors blend — making code density and co-occurrence immediately perceptible. |
| Margin bars (open source) | MAXQDA's most-loved feature, now free. Visual overview of coding density per document without scrolling. |
| Free, local-first | Zero cost. Zero vendor lock-in. Data lives in your vault as JSON — portable, auditable, version-controllable. No subscription, no cloud dependency, no data sharing. |

### Step 4: Best-Fit Customers

**Primary:** PhD students and postdoctoral researchers in social science, education, and health who:
- Already use Obsidian for literature reviews, note-taking, or thesis writing
- Need to code qualitative data across multiple types (interviews + images + documents)
- Cannot afford $500+/yr CAQDAS licenses (or resent paying it)
- Value data ownership and portability
- Work in mixed methods traditions (Creswell, Saldana)

**Secondary:** Obsidian power users who:
- Do professional qualitative work (UX research, journalism, policy analysis)
- Want QDA without leaving their existing PKM workflow
- Are comfortable with community plugins and slightly rough edges

**Tertiary:** Methods instructors who:
- Teach qualitative or mixed methods courses
- Need a free tool students can install without institutional licenses
- Want to demonstrate advanced analytics (MCA, MDS) without R

**Anti-persona:** Large research teams at well-funded institutions with IT-mandated NVivo site licenses. They will not switch, and Qualia should not try to win them. The synthetic users research confirms this: "Obsidian as synthesis-first workspace complementary to CAQDAS" — some researchers will use Qualia alongside ATLAS.ti/NVivo, not instead of it.

### Step 5: Market Category

**Category:** Qualitative Data Analysis plugin for Obsidian

Not "CAQDAS alternative" (too adversarial, triggers defensive comparison). Not "Obsidian plugin" (too generic, obscures the QDA depth). The category is the intersection:

> Qualia Coding is a qualitative data analysis environment that lives inside Obsidian.

This positions Qualia as the only tool that exists at the intersection of two mature categories (QDA software and personal knowledge management), rather than competing head-to-head with $1B CAQDAS incumbents.

The subcategory Qualia can own is: **"research-grade QDA inside a PKM tool"** — a category of one.

### Step 6: Relevant Trends (Why Now)

1. **Lumivero consolidation (Sept 2024):** Private equity now owns both NVivo and ATLAS.ti. MAXQDA is the only independent. Researchers are anxious about price increases, feature homogenization, and data lock-in. The window for open-source alternatives is widening.

2. **Local-first movement:** Post-Notion, post-Roam, the PKM community has shifted toward local-first tools. Obsidian has 1M+ users. The principle "your data should live on your machine" resonates especially with researchers handling sensitive participant data (IRB/ethics requirements).

3. **AI skepticism in qualitative research:** Jowsey et al. (2025) rejects GenAI for reflexive qualitative research. Researchers are wary of "AI-washed" CAQDAS tools that promise automated coding. Qualia's position — AI amplifies, does not substitute human interpretive sensitivity — aligns with the epistemological mainstream.

4. **Mixed methods growth:** The "crossover mixed analysis" paradigm (Sandelowski, Onwuegbuzie) demands tools that handle both qual and quant data. The asymmetry between quantitization and qualitization resources represents opportunity. Qualia's 5 exclusive analytics views directly address this.

5. **Open-source QDA maturation:** QualCoder reached v3.6+ with AI coding. Taguette has steady GitHub activity. The FOSS QDA space is growing, but no project has attempted the breadth of Qualia (7 engines, built-in analytics, PKM integration).

---

## 2. MESSAGING ARCHITECTURE

### One-liner (10 seconds)

> Qualitative data analysis inside Obsidian — 7 data types, built-in analytics, free and local-first.

### Sub-hero (30 seconds)

> Qualia Coding turns Obsidian into a complete qualitative research environment. Code markdown, PDFs, images, audio, video, CSV, and Parquet files — all with the same codes, the same sidebar, the same workflow. Run MCA biplots, lag sequential analysis, and decision trees without leaving your vault. Your data stays as JSON in your vault. No subscription, no cloud, no lock-in.

### Detail (2 minutes)

> Qualitative research is an act of interpretation, not just tagging. The researcher is a bricoleur — a creative methodological craftsperson who weaves meaning from diverse data. But current QDA tools treat coding as a management task: import documents, apply codes, export tables. The thinking happens elsewhere.
>
> Qualia Coding is built on a different premise: coding is thinking, and thinking should happen where your research already lives. Inside Obsidian, your coded data connects to your literature notes, your memos, your emerging theory — through the same graph, the same backlinks, the same vault.
>
> Seven coding engines handle every data type a mixed methods researcher encounters: interview transcripts (Markdown), scanned documents (PDF), survey data (CSV and Parquet), photographs (Image), recorded interviews (Audio and Video). A seventeenth-view analytics engine — with MCA biplots, MDS maps, lag sequential analysis, polar coordinates, and CHAID decision trees — lets you do quantitization inside the same tool, without exporting to R or SPSS.
>
> The Research Board gives you a freeform canvas for visual synthesis: arrange excerpts, snapshots, and KPI cards to see the whole picture. MAXQDA-style margin bars show coding density at a glance. Per-code opacity blending makes overlapping codes visible, not hidden.
>
> All of this is free, open-source, and local-first. Your data lives in your vault as `data.json` — portable, auditable, yours. No subscription, no cloud dependency, no vendor lock-in.

### Messaging by Persona

**Academic Researcher (PhD/Postdoc)**

*Hook:* "Your qualitative coding and your research thinking finally live in the same place."

*Key messages:*
- Code 7 data types without leaving Obsidian — where your literature notes, memos, and emerging theory already live
- Built-in mixed methods analytics (MCA, MDS, Lag Sequential, CHAID) — no R/SPSS export needed
- Free. Your university does not need to buy a site license. Your students do not need to pay $500/yr.
- Local-first: sensitive participant data never leaves your machine
- "Creating an excerpt-note is itself an act of synthesis" — the cognitive leap of turning data into a knowledge atom is where insight happens, and Qualia keeps you in that flow

*Theoretical grounding:* The researcher as bricoleur (Levi-Strauss) — Qualia is the workshop where diverse materials become coherent understanding. The crossover mixed analysis vision (Onwuegbuzie) — qual and quant are not separate phases but interdependent dimensions of the same inquiry.

**Obsidian Power User**

*Hook:* "Full QDA without leaving your vault."

*Key messages:*
- 7 engines: Markdown, PDF, CSV, Image, Audio, Video, Analytics — all inside Obsidian
- Your codes show up in graph view. Your excerpts link to your notes. Your vault is your research project.
- Single `data.json` — sync with whatever you already use (iCloud, Syncthing, Git)
- MAXQDA-level features (margin bars, per-code colors, research board) in a community plugin
- "It's like having an Atlas.ti inside Obsidian" (Prof. Yamamoto)

**Methods Student**

*Hook:* "Learn qualitative coding with a free tool that grows with your skills."

*Key messages:*
- Free — no student license negotiations, no trial expirations
- Start simple (code a markdown file), advance to mixed methods (CSV + analytics)
- Built-in analytics teach you what MCA, MDS, and lag sequential analysis actually do — with your own data
- Local-first: your thesis data stays on your laptop, not on a vendor's cloud
- Portable: if you later need NVivo for your lab, REFI-QDA export (planned) lets you migrate

---

## 3. ICP DEFINITION

### Persona 1: Dr. Nia — The Networked Qualitative Researcher

**Title:** Postdoctoral researcher, Department of Education, mid-tier research university

**Goals:**
- Complete a multi-site ethnographic study with 40+ interviews, 200+ field photographs, and classroom video recordings
- Develop an emergent theoretical framework connecting across data types
- Publish 3 papers from the dataset within 18 months

**Fears:**
- Data loss or corruption mid-project (has heard ATLAS.ti horror stories)
- Vendor lock-in: investing months of coding in a tool she cannot afford next year
- Missing connections between data sources because the tool keeps them in separate silos
- AI coding that flattens the interpretive nuance she has spent years developing

**Current tools:** ATLAS.ti for systematic coding, Obsidian for literature review and memo-writing, R for quantitative analysis. Manually copies key excerpts from ATLAS.ti into Obsidian for synthesis work.

**Qualia appeal:** Eliminates the manual bridge between coding and thinking. Graph view surfaces relationships that ATLAS.ti's linear outputs miss. Free means no renewal anxiety.

**Messaging hooks:**
- "When those connections start to pop out, it's like a small jolt of electricity" — this is what Dr. Nia lives for
- "In Atlas.ti, I'm managing the project, the codes, the documents. In Obsidian, I'm just... thinking with the data."
- "Low-friction capture preserves cognitive state" — delayed capture means lost nuance

### Persona 2: Prof. Lucas — The Mixed Methods Methodologist

**Title:** Associate Professor, Department of Public Health, large state university

**Goals:**
- Run a mixed methods study combining patient survey data (CSV), clinical interviews (audio), medical images, and chart notes (PDF)
- Demonstrate quantitization and qualitization techniques to graduate students
- Find a tool that embodies the "crossover mixed analysis" paradigm rather than bolting quant onto a qual tool

**Fears:**
- Students cannot afford MAXQDA licenses ($253+/yr)
- Teaching with proprietary tools creates dependency on vendor goodwill
- "Mixed methods" in current tools means "we added a chart" — not genuine integration of qual and quant reasoning
- Team projects require intercoder reliability, which free tools lack

**Current tools:** MAXQDA (personal license), SPSS for quantitative analysis, Excel for joint displays. Recommends MAXQDA to students but feels guilty about the cost.

**Qualia appeal:** CSV + Parquet coding is unique — students can code survey open-ends alongside interview data. Built-in MCA, MDS, and CHAID mean quantitization happens inside the coding tool, not in a separate statistical package. Free means every student can use it.

**Messaging hooks:**
- "It's like having an Atlas.ti inside Obsidian" (Prof. Yamamoto)
- The 5 exclusive analytics views map directly to the mixed methods curriculum
- File-based data means student projects are portable and auditable for assessment

### Persona 3: Alex — The Obsidian-Native Researcher

**Title:** UX researcher at a mid-size tech company, heavy Obsidian user

**Goals:**
- Code user interview recordings (audio/video), survey responses (CSV), and screenshot annotations (image) for a product redesign project
- Keep all research artifacts in the same vault as design notes, stakeholder meeting logs, and project documentation
- Produce a visual synthesis (research board) for stakeholder presentation

**Fears:**
- Having to learn and maintain a separate tool (NVivo, Dovetail) for a 3-month project
- Losing the linked, networked quality of Obsidian when moving to a siloed QDA tool
- Data leaving the company's approved storage (cloud QDA tools are a compliance risk)

**Current tools:** Obsidian for everything. Has tried Dovetail (too expensive for solo use) and manual tagging in Obsidian (too fragile for 30+ interviews).

**Qualia appeal:** Everything stays in the vault. No new tool to learn beyond the plugin. Local-first satisfies IT compliance. Research Board produces a visual output without PowerPoint.

**Messaging hooks:**
- "Linking and lateral navigation produce networked insights that CAQDAS doesn't surface"
- Your codes are vault data — searchable, linkable, graph-visible
- One install, seven data types, zero subscriptions

---

## 4. COMPETITIVE BATTLECARDS

### 4.1 Battlecard: NVivo (Lumivero)

**Overview:** Market leader by installed base. $118-1,800/yr. Now owned by Lumivero (PE). G2 4.1/5. Desktop-only. Institutional lock-in via site licenses and training programs.

**Key Strengths:**
- Institutional inertia — "nobody gets fired for buying NVivo"
- Comprehensive training ecosystem (NVivo Essentials, YouTube, university workshops)
- Transcription integration
- Team collaboration features (NVivo Collaboration Cloud)

**Key Weaknesses:**
- Performance degrades at 70+ sources (well-documented user complaints)
- Mediocre PDF coding experience
- Dated UI (Windows-first design, macOS is second-class)
- Expensive: $1,800/yr for the full Windows version
- Now PE-owned alongside ATLAS.ti — consolidation risk
- Data locked in `.nvp` project files

**Our Advantages:**
- Free vs. $118-1,800/yr
- Local-first, file-based (JSON) vs. proprietary project files
- 5 exclusive analytics views NVivo lacks entirely
- PDF coding with per-code opacity blending vs. NVivo's basic highlights
- Obsidian integration (graph, backlinks, community plugins) vs. siloed desktop app
- Performance: single-file JSON scales better than NVivo's project database at 70+ sources

**When to Win:**
- Researcher already uses Obsidian
- Budget-constrained (PhD students, unfunded researchers, developing-world institutions)
- Mixed methods researcher who wants built-in analytics
- Researcher handling sensitive data who needs local-first guarantees
- Researcher frustrated with NVivo performance at scale

**When to Lose:**
- Institution has NVivo site license and IT mandates it
- Large team project requiring NVivo Collaboration Cloud
- Researcher needs built-in transcription
- Researcher needs intercoder reliability (Qualia does not have this yet)

**Talk Tracks:**

*Objection: "My university provides NVivo for free."*
Response: "NVivo is free to you, but your data is locked in `.nvp` files that only NVivo can open. When you graduate or change institutions, your coded data does not come with you. Qualia stores everything as JSON in your vault — portable forever, readable by any tool."

*Objection: "NVivo is the standard in my field."*
Response: "NVivo is common, not required. Your methods section describes your coding process, not your software. Many published studies use ATLAS.ti, MAXQDA, or manual methods. What matters is methodological rigor, not brand name."

*Objection: "I need team features."*
Response: "For team coding, NVivo's collaboration tools are genuinely useful. Qualia is best for individual researchers or small teams who can share a vault via Git or Syncthing. If you need intercoder reliability, that feature is on Qualia's roadmap but not available yet — be transparent about this."

**Proof Points:**
- 7 data types vs. NVivo's 5 (no CSV/Parquet coding, no built-in analytics canvas)
- G2 reviewers consistently cite NVivo's performance issues and dated UI
- Lumivero PE acquisition (Sept 2024) creates uncertainty about pricing and product direction

---

### 4.2 Battlecard: ATLAS.ti (Lumivero)

**Overview:** Best AI integration in the market (OpenAI-powered). $51-670/yr. Now PE-owned by Lumivero. G2 4.5/5. Reports of data loss in user reviews.

**Key Strengths:**
- Best-in-class AI coding (OpenAI integration, auto-coding, sentiment analysis)
- Strong network visualization
- Cross-platform (Windows, macOS, web, iPad)
- Lower price point than NVivo

**Key Weaknesses:**
- AI features are token-metered (pay per use on top of subscription)
- Data loss reports in G2 reviews
- Now PE-owned alongside NVivo — same consolidation risk
- AI approach conflicts with reflexive qualitative methodology (Jowsey et al., 2025)
- Cloud dependency for AI features

**Our Advantages:**
- Free vs. $51-670/yr + token costs
- Local-first: zero cloud dependency, zero data exposure
- AI philosophy aligned with qualitative epistemology: "amplifies, does not substitute"
- 5 exclusive analytics views ATLAS.ti lacks
- CSV + Parquet coding (unique)
- Research Board as freeform canvas vs. ATLAS.ti's structured network view
- No data loss risk: JSON in vault, version-controllable with Git

**When to Win:**
- Researcher skeptical of AI-automated coding (epistemological alignment)
- Researcher concerned about data exposure through cloud AI
- Researcher who has experienced or heard about ATLAS.ti data loss
- Budget-constrained researcher who cannot afford token-metered AI
- Researcher who wants analytics without R/SPSS

**When to Lose:**
- Researcher who specifically wants AI-powered auto-coding
- Team requiring ATLAS.ti's cloud collaboration
- Researcher who values ATLAS.ti's polished iPad experience
- Cross-platform requirement (Qualia is Obsidian-only, which is desktop-only for plugins)

**Talk Tracks:**

*Objection: "ATLAS.ti has AI coding — Qualia doesn't."*
Response: "ATLAS.ti's AI codes for you. In reflexive qualitative research, the interpretive act of coding IS the analysis — outsourcing it to GPT undermines the methodology. Qualia's roadmap includes AI-assisted coding that suggests and surfaces patterns while keeping interpretive decisions with the researcher. AI amplifies; it does not substitute."

*Objection: "ATLAS.ti is cheaper than NVivo."*
Response: "ATLAS.ti is $51-670/yr plus token costs for AI features. Over a 4-year PhD, that is $200-2,680 minimum. Qualia is free forever. And your data stays as portable JSON, not locked in an ATLAS.ti project."

**Proof Points:**
- Jowsey et al. (2025) explicitly rejects GenAI for reflexive qualitative research
- G2 reviews documenting ATLAS.ti data loss
- Token-metered AI creates unpredictable costs for budget-constrained researchers

---

### 4.3 Battlecard: MAXQDA (VERBI)

**Overview:** The strongest competitor. Only independent CAQDAS vendor. Mixed methods gold standard. Best learning curve among Big 3. EUR 253-1,440/yr. Capterra 4.7/5. Desktop-only.

**Threat Level: HIGH**

**Key Strengths:**
- Mixed methods gold standard: joint displays, typology tables, integration framework
- Best learning curve — researchers consistently praise MAXQDA's usability
- Independent vendor (not PE-owned) — trusted for long-term stability
- Margin bars (visual coding overview) — industry-defining feature
- Strong training ecosystem (MAXQDA Press books, webinars, certified trainers)
- AI features as optional EUR 120/yr add-on (not forced)
- Capterra 4.7/5 — highest-rated CAQDAS

**Key Weaknesses:**
- EUR 253-1,440/yr — expensive for individuals
- Desktop-only (Windows/macOS), no web or mobile
- AI is an add-on, not deeply integrated
- No built-in advanced analytics (MCA, MDS, Lag Sequential, Polar, CHAID)
- No CSV or Parquet coding
- No PKM integration — data lives in MAXQDA project files
- No freeform research canvas (has "MAXMaps" but it is structured, not freeform)

**Our Advantages:**
- Free vs. EUR 253-1,440/yr
- MAXQDA-style margin bars — in open source
- 5 exclusive analytics views MAXQDA lacks: MCA Biplot, MDS Map, Lag Sequential, Polar Coordinates, CHAID Decision Tree
- CSV + Parquet coding (unique in the world)
- Per-code opacity blending (MAXQDA uses solid colors)
- Obsidian integration: graph view, backlinks, community plugins
- Research Board (freeform canvas) vs. MAXMaps (structured)
- Local-first, file-based: JSON in vault vs. MAXQDA project files

**When to Win:**
- Researcher who cannot afford MAXQDA
- Mixed methods researcher who wants built-in analytics (MCA, MDS, CHAID) without R
- Researcher who already uses Obsidian for knowledge management
- Researcher who values the "coding as thinking" integration with PKM
- Researcher coding CSV/Parquet data (unique capability)

**When to Lose:**
- Researcher who needs MAXQDA's mature joint displays and typology tables
- Researcher who needs intercoder reliability (MAXQDA has it; Qualia does not yet)
- Researcher who needs case variables (on Qualia's roadmap, not implemented)
- Team requiring MAXQDA TeamCloud
- Researcher who values MAXQDA's training ecosystem and certified support

**Talk Tracks:**

*Objection: "MAXQDA is the gold standard for mixed methods."*
Response: "MAXQDA is excellent for structured mixed methods workflows — joint displays, typology tables, integration matrices. Qualia takes a different approach: instead of structured templates, it provides exploratory analytics (MCA, MDS, Lag Sequential) and a freeform research board inside your knowledge management system. If your mixed methods work is emergent and interpretive rather than procedural, Qualia may fit better. If you need structured joint displays today, MAXQDA is the right choice."

*Objection: "MAXQDA has margin bars — you just copied them."*
Response: "Margin bars are a visualization pattern, not a proprietary feature. We implemented them because they are genuinely the best way to show coding density at a glance. MAXQDA deserves credit for pioneering them. We added per-code opacity blending, which MAXQDA does not have — overlapping codes blend visually instead of stacking as solid bars."

*Objection: "I need intercoder reliability for my dissertation."*
Response: "You're right — Qualia does not have intercoder reliability yet. It is the #3 priority on our roadmap. If your committee requires ICR reporting and you need it now, MAXQDA or NVivo are the right choice today. Consider using Qualia for your individual interpretive work and a CAQDAS tool for the ICR phase — the synthetic users research shows this complementary workflow is common."

**Proof Points:**
- 5 analytics views that MAXQDA lacks entirely
- MAXQDA costs EUR 253+/yr; Qualia is free
- CSV + Parquet coding is unique — no CAQDAS tool offers this
- Margin bars + per-code opacity blending in open source

---

### 4.4 Battlecard: Quadro (Obsidian Plugin)

**Overview:** Most direct competitor. Free Obsidian plugin, listed in community directory. Markdown-only. Codes via wikilinks. Minimal feature set.

**Key Strengths:**
- Already listed in Obsidian Community Plugin Directory (distribution advantage)
- Simple mental model: codes are wikilinks, excerpts are block references
- Leverages native Obsidian features (no custom UI)
- Lightweight, easy to understand

**Key Weaknesses:**
- Markdown-only — no PDF, Image, Audio, Video, CSV, or Parquet
- No analytics
- No visual coding features (no margin bars, no opacity blending, no research board)
- No coding popover — uses Obsidian's native link/tag system
- No sidebar with code explorer or detail views
- Very limited feature depth

**Our Advantages:**
- 7 data types vs. 1
- 17 analytics views vs. 0
- Coding popover with code management vs. manual wikilink tagging
- Margin bars, per-code opacity blending, research board
- Unified sidebar (code explorer + detail view) across all engines
- Professional-grade QDA features (segment coding in CSV, shape drawing in PDF/Image, region coding in audio/video)

**When to Win:**
- Always, if the researcher needs more than markdown coding
- Researcher who needs analytics
- Researcher who wants a structured coding workflow (not just tagging)
- Researcher who needs visual coding features

**When to Lose:**
- Researcher who only codes markdown and wants maximum simplicity
- Researcher who prefers "native Obsidian" approach (wikilinks as codes) over a plugin-specific UI
- Researcher who values being listed in the community directory (Quadro is; Qualia is not yet)

**Talk Tracks:**

*Objection: "Quadro is simpler and already in the community directory."*
Response: "Quadro is great for simple text tagging. If your research involves only markdown files and you want codes as wikilinks, Quadro may be all you need. But if you code PDFs, images, audio, video, or CSV data — or if you want analytics, margin bars, or a research board — Qualia handles all of that in one plugin."

**Proof Points:**
- 7 engines vs. 1
- 17 analytics views vs. 0
- 28K LOC depth vs. lightweight tagging

---

## 5. GTM STRATEGY

### Constraints

- Pre-revenue, free plugin, not yet listed in Obsidian Community Plugin Directory
- Solo developer
- Academic niche (QDA researchers + Obsidian power users)
- No funding, no marketing budget
- Product is deep (28K LOC, 7 engines) but rough around some edges

### Strategy: Product-Led Growth with Academic Community Seeding

The GTM strategy has three phases, each building on the previous. The core loop is: **researcher discovers Qualia -> uses it -> tells their methods class/lab group/Twitter followers**. Academic word-of-mouth is the only scalable distribution for a solo-developer free tool in this niche.

---

### Phase 1: Community Listing + Organic Discovery (Months 1-3)

**Objective:** Get listed in the Obsidian Community Plugin Directory and establish a baseline of organic installs.

**Channels and Tactics:**

| Channel | Tactic | Metric |
|---------|--------|--------|
| Obsidian Community Plugin Directory | Submit plugin, pass review, get listed | Listed Y/N, installs/week |
| Obsidian Discord | Announce in #plugin-showcase, answer QDA questions | Discord engagement |
| Obsidian Forum | Launch announcement post, respond to qualitative research threads | Forum views, replies |
| GitHub | Clean README with screenshots, GIF demos for each engine, clear issue templates | GitHub stars, issues opened |
| r/ObsidianMD | Launch post with demo screenshots/video | Upvotes, comments |
| r/qualitativeresearch | "I built a free QDA tool inside Obsidian" post | Upvotes, DMs |

**Key actions:**
1. Complete community plugin review requirements (code review, security, manifest)
2. Create a 3-minute demo video showing all 7 engines in a real research workflow
3. Write a clear README that leads with the value proposition, not the feature list
4. Prepare 5-7 screenshots showing: margin bars, PDF coding, CSV coding, analytics (MCA biplot), research board, audio coding, image coding

**Target metrics (end of Phase 1):**
- 200+ installs
- 30+ GitHub stars
- 5+ community forum/Discord mentions by non-developer users

---

### Phase 2: Academic Community Building (Months 3-6)

**Objective:** Establish Qualia as a known option in the qualitative research methods community.

**Channels and Tactics:**

| Channel | Tactic | Metric |
|---------|--------|--------|
| Academic Twitter/Mastodon | Share bite-sized demos: "Here's MCA Biplot on interview data" | Impressions, retweets |
| Methods listservs (QUALRS-L, MMIRA) | Announce as free alternative, offer to present at virtual meetup | Listserv replies |
| YouTube | Tutorial series: "Qualitative Coding in Obsidian" (5-8 videos, 10-15 min each) | Views, subscribers |
| Methods conferences (virtual) | Submit workshop proposals for ICQI, MMIRA, or regional methods conferences | Accepted proposals |
| Methods blogs | Guest post on "The Qualitative Report" or "Methodspace" about local-first QDA | Referral traffic |

**Key actions:**
1. Create a tutorial series with a real (anonymized) dataset:
   - Episode 1: Setting up Qualia + coding your first markdown transcript
   - Episode 2: PDF coding with margin bars and opacity blending
   - Episode 3: Image and audio/video coding
   - Episode 4: CSV coding for survey open-ends
   - Episode 5: Analytics — from frequency counts to MCA biplots
   - Episode 6: Research Board — visual synthesis
   - Episode 7: Mixed methods workflow — qual + quant in one vault
2. Create a sample vault with pre-coded data that new users can download and explore
3. Engage with 10-15 qualitative researchers on Twitter who post about CAQDAS frustrations
4. Submit a workshop proposal to at least one methods conference

**Target metrics (end of Phase 2):**
- 1,000+ installs
- 100+ GitHub stars
- 3+ unsolicited mentions in academic social media
- 1+ tutorial video with 500+ views
- 1+ conference workshop accepted

---

### Phase 3: Content-Led Growth (Months 6-12)

**Objective:** Become the default recommendation when someone asks "What's a free QDA tool?" in academic spaces.

**Channels and Tactics:**

| Channel | Tactic | Metric |
|---------|--------|--------|
| SEO | "Free qualitative data analysis software" landing page (GitHub Pages or vault.md) | Organic search traffic |
| YouTube SEO | Optimize tutorial titles for "NVivo alternative", "free QDA software", "qualitative coding tutorial" | Search-driven views |
| Academic citations | Encourage researchers to cite the GitHub repo or a methods note in publications | Citations |
| Obsidian ecosystem | Cross-promote with complementary plugins (Dataview, Templater, Zotero integration) | Cross-referral installs |
| REFI-QDA export | When implemented, announce as migration path from NVivo/ATLAS.ti/MAXQDA | Migration-driven installs |

**Key actions:**
1. Publish a methods note or software paper describing Qualia's design principles (target: "The Qualitative Report", "Forum: Qualitative Social Research", or "Journal of Mixed Methods Research")
2. Create a "Switching from NVivo/ATLAS.ti/MAXQDA" guide
3. Implement REFI-QDA export and announce as migration enabler
4. Build relationships with 3-5 methods instructors who might adopt Qualia in their courses
5. Create a "Qualia Coding Cookbook" — step-by-step workflows for common research designs

**Target metrics (end of Phase 3):**
- 5,000+ installs
- 500+ GitHub stars
- 1+ academic publication mentioning Qualia
- 3+ methods instructors using Qualia in courses
- Consistent 50+ new installs per week

---

## 6. LAUNCH PLAN (Community Plugin Listing)

### 90-Day Plan

#### Pre-Launch (Days -30 to 0)

**Week -4: Technical Preparation**
- [ ] Audit plugin against Obsidian community plugin review guidelines
- [ ] Ensure `manifest.json`, `versions.json`, and `package.json` are correct
- [ ] Remove any hardcoded paths, debug logging, or development artifacts
- [ ] Verify the plugin works on Windows, macOS, and Linux
- [ ] Ensure clean uninstall (no orphaned files)
- [ ] Test with Obsidian Installer version and latest version

**Week -3: Documentation and Assets**
- [ ] Write a compelling README.md with:
  - One-liner value proposition
  - 7 engine screenshots (one per data type)
  - 30-second GIF showing a coding workflow
  - Quick start guide (3 steps)
  - Link to full documentation
- [ ] Create 5-7 high-quality screenshots showing:
  - Markdown coding with margin bars
  - PDF coding with opacity blending
  - CSV coding with segment editor
  - Image coding with shape drawing
  - Audio/Video coding with waveform
  - Analytics (MCA biplot or network graph)
  - Research Board
- [ ] Record a 3-minute demo video

**Week -2: Community Seeding**
- [ ] Post in Obsidian Discord #plugin-dev channel asking for beta testers
- [ ] Recruit 5-10 beta testers (mix of Obsidian users and academic researchers)
- [ ] Collect and address feedback from beta testers
- [ ] Fix any critical bugs identified

**Week -1: Submission**
- [ ] Submit PR to obsidianmd/obsidian-releases
- [ ] Prepare launch announcement drafts for: Obsidian Forum, Discord, Reddit, Twitter
- [ ] Prepare a "Known Limitations" section (honest about: no AI coding yet, no intercoder reliability, no REFI-QDA export)

#### Launch Week (Days 1-7)

**Day 1 (Listing Goes Live):**
- [ ] Post on Obsidian Forum (Plugin Showcase category) — detailed announcement with screenshots and demo video
- [ ] Post in Obsidian Discord #plugin-showcase
- [ ] Post on r/ObsidianMD
- [ ] Post on Twitter/Mastodon with 3-4 key screenshots

**Day 2-3:**
- [ ] Post on r/qualitativeresearch
- [ ] Post on r/AcademicPhilosophy, r/GradSchool if rules allow
- [ ] Respond to every comment and question within 24 hours
- [ ] DM 5-10 Obsidian/academic influencers with a personal note

**Day 4-7:**
- [ ] Monitor GitHub issues — respond same day
- [ ] Post a "Day 3 Update" on Obsidian Forum with early feedback highlights
- [ ] Share any user testimonials or interesting use cases on Twitter

**Launch Week Targets:**
- 100+ installs
- 20+ GitHub stars
- 0 critical bugs reported (or fixed within 24 hours)
- 50+ Obsidian Forum post views

#### Post-Launch Growth (Days 8-90)

**Weeks 2-4: Stabilize and Listen**
- [ ] Fix all bugs reported in first week
- [ ] Identify top 3 user-requested features
- [ ] Publish first tutorial video (Markdown coding basics)
- [ ] Post weekly "dev update" on Obsidian Forum thread

**Weeks 5-8: Content Push**
- [ ] Publish tutorial videos 2-4
- [ ] Create sample vault with pre-coded demo data
- [ ] Write a guest post for a methods blog or newsletter
- [ ] Submit a conference workshop proposal

**Weeks 9-12: Community Building**
- [ ] Publish tutorial videos 5-7
- [ ] Engage on academic Twitter with QDA-related discussions
- [ ] Start a "Qualia Coding" discussion thread on Obsidian Forum for ongoing feedback
- [ ] Announce roadmap priorities based on community feedback
- [ ] Release first post-launch update with user-requested improvements

**Day 90 Targets:**
- 500+ installs
- 50+ GitHub stars
- 3+ tutorial videos published
- 1+ external blog post or mention
- Active GitHub issue tracker with community participation

---

## 7. STRATEGIC RECOMMENDATIONS

### The 5 Most Important Things to Do in the Next 6 Months

**1. Get Listed in the Obsidian Community Plugin Directory (Month 1)**

This is the single highest-leverage action. Without community listing, Qualia is invisible to its primary audience. Every other recommendation depends on discoverability. The gap analysis scored this 45/70 — it is the distribution bottleneck. Prioritize the submission over new features. A listed plugin with 7 engines beats an unlisted plugin with 8 engines.

**2. Implement AI-Assisted Coding with a Local-First, Human-Centered Approach (Months 2-4)**

The gap analysis scored this 62/70 — the highest priority feature gap. But the implementation philosophy matters more than the feature itself. The market is moving toward "AI does the coding for you" (ATLAS.ti's approach). Qualia's differentiator is the opposite: AI surfaces patterns, suggests codes, highlights anomalies — but the researcher makes every interpretive decision. This aligns with Jowsey et al. (2025) and the epistemological mainstream in qualitative research. The messaging writes itself: "AI that respects your methodology."

Practical approach: local LLM integration (Ollama) for sensitive data, optional cloud API for users who consent. Code suggestion, not auto-coding. Pattern highlighting, not pattern replacement. Make the researcher more reflexive, not less.

**3. Ship Intercoder Reliability (Months 3-5)**

Scored 44/70 in the gap analysis. This is the academic credibility blocker. Without ICR, Qualia cannot be recommended for dissertation research in many programs. Committees ask: "How did you establish coding reliability?" If the answer is "I couldn't because my tool doesn't support it," the tool gets blamed. Implementing even basic percentage agreement and Cohen's kappa would remove this objection. Full Krippendorff's alpha is ideal but not required for v1.

**4. Build a Tutorial Series and Sample Vault (Months 2-4, ongoing)**

The most cost-effective marketing investment for a solo developer. A 7-episode YouTube tutorial series with a downloadable sample vault accomplishes three things simultaneously:
- **Discovery:** "free QDA software tutorial" is a high-intent search query
- **Activation:** new users can explore pre-coded data before committing their own
- **Trust:** video demonstrations prove the tool works, reducing perceived risk

The tutorial series should follow a real (anonymized) research workflow, not feature demos. Show the thinking, not just the clicking. "Here's how I would approach coding this interview transcript" is more compelling than "Here's how to create a code."

**5. Publish a Methods Note or Software Paper (Month 5-6)**

A short paper in "The Qualitative Report" (open access, fast review) or "Forum: Qualitative Social Research" describing Qualia's design philosophy — grounded in the theoretical foundations (bricoleur, crossover mixed analysis, coding as thinking) — would do more for credibility than any number of Reddit posts. Academic researchers trust peer-reviewed publications. A software paper also gives other researchers something to cite, creating a virtuous loop: citation drives discovery drives adoption drives more citation.

The paper should not be a feature list. It should be an argument: "Qualitative coding tools separate analysis from thinking. Here is why that is epistemologically problematic, and here is a tool designed on different principles." Ground it in Sandelowski, Onwuegbuzie, Saldana, and Levi-Strauss. Let the features serve the argument.

---

### Summary of Priorities (Sequenced)

| Month | Action | Type |
|-------|--------|------|
| 1 | Community Plugin Listing | Distribution |
| 2 | Begin tutorial series + sample vault | Content |
| 2-4 | AI-Assisted Coding (local-first) | Product |
| 3-5 | Intercoder Reliability | Product |
| 4 | Conference workshop submission | Community |
| 5-6 | Methods note / software paper | Credibility |

The through-line: **ship the listing, then alternate between product depth (AI, ICR) and community presence (tutorials, paper, conference)**. A solo developer cannot do everything at once. But a free, deep, well-documented tool in an underserved niche can grow through academic word-of-mouth if it is discoverable and credible. Discoverability comes from the listing and tutorials. Credibility comes from ICR support and a published paper. Everything else follows.

---

*Document generated 2026-03-03. Based on synthetic users research (SyntheticUsers.com, Feb 2026), competitive landscape analysis, and mixed methods theoretical foundations (Sandelowski, Onwuegbuzie, Creswell, Saldana, Levi-Strauss, Jowsey et al. 2025).*
