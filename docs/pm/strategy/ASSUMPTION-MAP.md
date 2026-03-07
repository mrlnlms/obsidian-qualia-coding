# Assumption Map — Qualia Coding

**Date:** 2026-03-03
**Sources analyzed:** PMM Strategy (`PMM-STRATEGY.md`) + Gap Analysis (`2026-03-03-analysis.md`)
**Method:** Extract all implicit assumptions, score Confidence (1-5) and Impact (1-5), Priority = Impact - Confidence.
**CRITICAL threshold:** Impact >= 4 AND Confidence <= 2

---

## Full Assumption Map

| # | Assumption | Category | Confidence | Impact | Priority | Source | Recommended Validation |
|---|-----------|----------|:----------:|:------:|:--------:|--------|----------------------|
| 1 | **Target researchers already use Obsidian** — the entire strategy assumes the primary audience (PhD/postdoc qualitative researchers) is already in the Obsidian ecosystem | Desirability | 2 | 5 | **3 CRITICAL** | PMM §4 ICP | Survey on r/qualitativeresearch + QUALRS-L: "What tools do you use for note-taking/knowledge management?" Measure Obsidian penetration in QDA audience. |
| 2 | **"Free" matters more than "trusted"** — positioning leads with $0 cost vs $500+/yr, but academics often choose institutionally-endorsed tools regardless of price | Desirability | 2 | 4 | **2 CRITICAL** | PMM §1, §2, Comparison | Interview 5-10 PhD students: "Would you use a free, unlisted, solo-developer plugin for your dissertation data?" Listen for trust signals vs price signals. |
| 3 | **Obsidian Community Plugin Directory is the primary discovery channel** — GTM assumes listing → installs, but QDA researchers may discover tools through conferences, advisors, and methods courses, not plugin browsers | Desirability | 2 | 4 | **2 CRITICAL** | PMM §5, §6, Gap #18 | Ask 10 qualitative researchers: "How did you discover the QDA tool you currently use?" Track the answer distribution: advisor recommendation, course requirement, Google search, peer, conference, plugin browser. |
| 4 | **5 exclusive analytics views are valued** — MCA, MDS, LSA, Polar, CHAID are positioned as key differentiators, but most qualitative researchers may not know what these are or want them | Desirability | 2 | 4 | **2 CRITICAL** | PMM §1 Step 2-3, Gap analysis "unique" claims | Post on r/qualitativeresearch: "Would built-in MCA biplots or lag sequential analysis change your tool choice?" Gauge awareness and interest. Also check: do mixed methods courses teach these techniques? |
| 5 | **Researchers will trust a solo-developer plugin with their dissertation data** — the anti-persona excludes large teams, but even solo PhD researchers may not trust an unlisted, single-maintainer plugin for months of irreplaceable coding work | Desirability | 2 | 5 | **3 CRITICAL** | PMM §4, §5, Gap #18 | Synthetic users research partially validates this ("researchers tolerate tooling risk IF interoperability and data safety are guaranteed"). But need to test: does JSON export + local-first actually resolve trust? Offer beta testers a real project and observe if they commit or hedge. |
| 6 | **"Coding as thinking" resonates with target users** — the messaging assumes researchers frame coding as interpretive work and want it integrated with PKM, not as a mechanical task they want to finish quickly | Desirability | 3 | 3 | 0 | PMM §2 messaging | A/B test two messaging variants: "Coding as thinking" (interpretive) vs "Code faster, across 7 formats" (productivity). Test on landing page or Reddit post. |
| 7 | **Local-first is a differentiator, not just a constraint** — positioning frames local-first as a feature (privacy, IRB, portability), but many researchers don't think about data location until something goes wrong | Desirability | 3 | 3 | 0 | PMM §1 Step 6, §2 | Survey: "Where is your current QDA project stored? Do you know? Does it matter to you?" Most researchers may not care until prompted. |
| 8 | **Lumivero consolidation creates a migration window** — strategy assumes researchers are anxious about PE ownership of NVivo + ATLAS.ti, but most may not know or care about corporate ownership | Desirability | 2 | 3 | 1 | PMM §1 Step 6 | Monitor: have NVivo/ATLAS.ti prices actually increased post-acquisition? Are researchers posting about it? Track social media sentiment. |
| 9 | **Margin bars matter outside the MAXQDA user base** — repeatedly highlighted as a key feature, but only researchers who have used MAXQDA know what margin bars are | Desirability | 3 | 2 | -1 | PMM §1 Step 2, §2, Battlecards | Low risk. Margin bars are visually self-evident in screenshots. Users who haven't seen them before still appreciate them — no MAXQDA experience required. |
| 10 | **CSV/Parquet coding is a real use case** — positioned as "unique in the world," but is anyone actually trying to do qualitative coding on structured data? | Desirability | 2 | 3 | 1 | PMM §1 Step 2, Gap analysis | Ask mixed methods researchers: "Have you ever wanted to qualitatively code cells in a spreadsheet?" If answer is blank stares, this is a solution without a problem. |
| 11 | **AI-assisted coding can be implemented local-first within Obsidian** — strategy assumes Ollama/local LLMs can run within Electron's constraints with acceptable performance | Feasibility | 3 | 5 | **2 CRITICAL** | PMM §7, Gap #14 (62/70) | Technical spike: run Ollama from Obsidian plugin via localhost HTTP. Measure: (1) latency per code suggestion, (2) memory footprint, (3) model quality on qualitative data. If >5s per suggestion or >4GB RAM, the UX is broken. |
| 12 | **Intercoder reliability can be implemented without Projects/Workspace** — Gap #15 notes it "may depend on Projects/Workspace (#13) for multi-coder support," but the sprint plan puts ICR before Projects | Feasibility | 2 | 4 | **2 CRITICAL** | Gap #15, PMM §7 | Architecture review: can coderId be added to markers without the full Projects system? If ICR requires multi-vault or multi-file data model, it's blocked by #13 and the timeline breaks. |
| 13 | **Community plugin review will pass without major issues** — the 2.1 MB bundle size, 7 engines, and 9 dependencies may trigger reviewer concerns about scope, performance, or security | Feasibility | 3 | 4 | 1 | PMM §6, Gap #18 | Read Obsidian community plugin review guidelines thoroughly. Check: is there a bundle size limit? Are there restrictions on number of dependencies? Ask in #plugin-dev Discord before submitting. |
| 14 | **Solo developer can sustain 28K LOC + 7 engines + content + community + research paper** — the 6-month plan includes: listing prep, AI coding, ICR, 7 YouTube tutorials, sample vault, conference submission, methods paper, ongoing bug fixes and community support | Feasibility | 1 | 5 | **4 CRITICAL** | PMM §7 summary, Content Calendar | This is the highest-risk assumption. Map every action to hours/week. If total exceeds 60 hrs/week, the plan is fantasy. Prioritize ruthlessly: listing first, then ONE of (AI coding OR tutorials), not both in parallel. |
| 15 | **Academic word-of-mouth scales without paid marketing** — GTM assumes the loop "researcher discovers → uses → tells lab group" is sufficient to reach 5,000 installs in 12 months | Viability | 2 | 4 | **2 CRITICAL** | PMM §5 | Benchmark: how fast did QualCoder, Taguette, and Quadro grow? Check GitHub stars over time. If similar free QDA tools took 3+ years to reach 5,000 users, the 12-month target is unrealistic. |
| 16 | **Methods note/software paper will be accepted in 6 months** — the timeline assumes submission in month 5-6 with timely acceptance, but academic review cycles are unpredictable (FQS says ~20 weeks) | Viability | 2 | 3 | 1 | PMM §7, Outreach Playbook | Realistic timeline: submit month 5, review 5 months, revisions 2 months, published month 12+. The paper is a long game, not a 6-month deliverable. Adjust expectations. |
| 17 | **MMIRA 2026 abstract submission is feasible by March 31** — the outreach playbook flags this deadline, but writing a credible abstract requires time the developer may not have alongside listing prep | Feasibility | 3 | 2 | -1 | Outreach Playbook | Low risk — a 500-word abstract is doable in 2-3 hours. The real question is whether attending in Brisbane is feasible (cost, time). Virtual alternatives may be better. |
| 18 | **Researchers want QDA in their PKM, not PKM in their QDA** — the positioning assumes the direction is "bring coding into Obsidian" rather than "bring linking/graphs into NVivo" | Desirability | 3 | 4 | 1 | PMM §1 Step 5 | The synthetic users research supports this ("Obsidian as synthesis-first workspace"). But if NVivo/MAXQDA add graph view or linking features, Qualia's positioning erodes. Monitor competitor roadmaps. |
| 19 | **"AI that respects your methodology" is a compelling message** — the PMM assumes researchers will prefer human-controlled AI over auto-coding, but many may just want "do this for me faster" | Desirability | 3 | 4 | 1 | PMM §7, Battlecard ATLAS.ti | Test with real researchers: show ATLAS.ti's auto-coding vs Qualia's planned suggest-not-replace approach. Which do they prefer? Jowsey et al. (2025) suggests methodologists prefer control, but practitioners may prefer speed. |
| 20 | **The Obsidian graph view adds analytical value for QDA** — messaging says graph reveals "relationships that linear CAQDAS cannot surface," but graph view with hundreds of coded notes may be noise, not insight | Usability | 2 | 3 | 1 | PMM §1 Step 3, §2, §3 | Test: create a vault with 50+ coded files and open graph view. Is it useful or spaghetti? If spaghetti, the messaging promise is misleading. May need filtered graph views or code-specific graphs. |
| 21 | **7 engines in one plugin is a feature, not a liability** — positioned as breadth advantage, but 2.1 MB bundle + complex UI + 7 different interaction patterns may overwhelm new users | Usability | 3 | 4 | 1 | PMM §1, Inventory (debt: onboarding) | Usability test: give 5 new users (who've never seen Qualia) a task and observe. Do they find the right engine? Do they understand margin bars? Time-to-first-code is the key metric. |
| 22 | **Researchers will adopt an unlisted plugin via manual install** — before community listing, the only install path is manual (download from GitHub). Early adopters may tolerate this, but it filters out most of the target audience | Viability | 4 | 3 | -1 | PMM §6 | Low risk — community listing is #1 priority. But the implication is: almost no growth is possible before listing. Don't invest in content marketing until listed. |
| 23 | **Per-code opacity blending is perceptible and useful** — positioned as unique visual feature, but with 5+ overlapping codes the blend may be muddy brown, not informative | Usability | 3 | 2 | -1 | PMM §1 Step 2, One-Pager | Low risk. Test with a screenshot using 5+ overlapping codes. If colors are indistinguishable, it's a UX bug, not a positioning problem. Fix the feature before promoting it. |
| 24 | **REFI-QDA export will enable migration from incumbents** — the gap analysis elevates REFI-QDA, but migration requires import too, and researchers may not migrate mid-project regardless | Desirability | 2 | 3 | 1 | Gap analysis, PMM §7 | Research: has anyone migrated between CAQDAS tools using REFI-QDA? Is the format actually used in practice, or is it a theoretical standard? Check KWALON/qdasoftware.org for adoption data. |
| 25 | **The Research Board is a meaningful differentiator** — positioned as unique, but researchers may already use Miro, FigJam, or physical whiteboards for synthesis and not want another canvas | Desirability | 3 | 2 | -1 | PMM §1 Step 2-3 | Low risk. The Research Board's value is integration (code cards pull from actual data), not the canvas itself. But monitor: do beta testers actually use it? |

---

## Risk Matrix

```
                        IMPACT
              1       2       3       4       5
         ┌───────┬───────┬───────┬───────┬───────┐
    5    │       │       │       │       │       │
         ├───────┼───────┼───────┼───────┼───────┤
    4    │       │  #22  │       │       │       │
  C      ├───────┼───────┼───────┼───────┼───────┤
  O  3   │       │#9,#23 │ #6,#7 │#18,#19│       │
  N      │       │  #25  │       │  #21  │       │
  F      ├───────┼───────┼───────┼───────┼───────┤
  I  2   │       │       │#8,#10 │ #2,#3 │ #1,#5 │
  D      │       │       │ #24   │ #4,#12│ #11   │
  E      │       │       │       │  #15  │       │
  N      ├───────┼───────┼───────┼───────┼───────┤
  C  1   │       │       │  #16  │       │ #14   │
  E      │       │       │       │       │       │
         └───────┴───────┴───────┴───────┴───────┘
```

---

## CRITICAL Assumptions (Impact >= 4, Confidence <= 2)

### CRITICAL #1: Target researchers already use Obsidian (Assumption #1)

**The assumption:** The entire product strategy — positioning, ICP, GTM, messaging — assumes that a meaningful number of qualitative researchers are already Obsidian users.

**Why it's critical:** If the Venn diagram of "qualitative researchers" and "Obsidian users" is tiny, the addressable market is microscopic. The product is excellent but the audience may not exist at scale.

**Evidence for:** Obsidian has 1M+ users. Academic use cases are visible on the forum (multiple long-running threads). The synthetic users research found researchers who use Obsidian alongside CAQDAS. Quadro (Obsidian QDA plugin) exists, suggesting demand.

**Evidence against:** No data on what percentage of Obsidian users do qualitative research. No data on what percentage of qualitative researchers use Obsidian. The synthetic users were specifically recruited as Obsidian-using researchers — they don't represent the broader QDA population.

**Validation plan:**
1. Post a survey on r/qualitativeresearch and QUALRS-L asking about PKM/note-taking tools (5 min, no mention of Qualia)
2. Cross-check Obsidian Forum academic threads for activity volume
3. Search Google Trends for "obsidian qualitative research" vs "nvivo qualitative research"
4. If the overlap is small: consider whether Qualia can attract researchers TO Obsidian, or whether it should position as a reason to adopt Obsidian

**Timeline:** Validate within 2 weeks (survey + desk research). This determines whether the entire GTM strategy is viable.

---

### CRITICAL #2: Solo developer can sustain the roadmap (Assumption #14)

**The assumption:** One person can simultaneously: prepare plugin for community listing, implement AI-assisted coding, implement intercoder reliability, produce 7 tutorial videos, create a sample vault, submit a conference abstract, write a methods paper, respond to GitHub issues, manage community presence, and fix bugs across 28K LOC and 7 engines.

**Why it's critical:** If this is physically impossible, everything else in the strategy is theoretical. Burnout = project abandonment = zero value from all the planning.

**Evidence for:** The developer has already built 28K LOC as a solo project. Clear evidence of sustained output.

**Evidence against:** Building is different from building + marketing + community + writing + supporting. The 6-month plan has ~15 major deliverables across product, content, community, and academic domains.

**Validation plan:**
1. Map every deliverable to estimated hours
2. Calculate total hours/month required
3. Compare to available hours (accounting for other work/life)
4. If total > available: cut scope. Suggested cuts:
   - Drop ICR from 6-month plan → push to month 8+
   - Reduce tutorials from 7 to 3 (engines 1-3 only)
   - Skip conference submission → focus on paper only
   - AI coding: architecture spike only in months 2-4, ship in months 5-7
5. The rule: **never have more than 2 workstreams active simultaneously** (1 product + 1 content/community)

**Timeline:** Do this exercise before starting any execution. 1 hour.

---

### CRITICAL #3: Obsidian plugin directory is the right discovery channel (Assumption #3)

**The assumption:** Getting listed in the Obsidian Community Plugin Directory will lead to organic discovery by qualitative researchers.

**Why it's critical:** If QDA researchers discover tools through advisors, courses, and conferences (not plugin browsers), then the listing provides discoverability only among Obsidian users — not among QDA researchers who don't yet use Obsidian.

**Evidence for:** Quadro is listed and has downloads. Obsidian users search the plugin browser for functionality.

**Evidence against:** The synthetic users research shows researchers discovered ATLAS.ti/MAXQDA through methods courses and advisor recommendations — not through app stores. Academic tool adoption is socially mediated.

**Validation plan:**
1. Check Quadro's download numbers (visible on Obsidian stats) — are they large enough to validate the channel?
2. If Quadro has <500 downloads after 1+ year listed, the channel may be insufficient for QDA tools
3. Regardless of listing, the academic outreach (tutorials, conference, paper) may be the actual driver

**Implication:** Community listing is necessary but may not be sufficient. The GTM should weight academic channels (YouTube tutorials, conference workshops, methods paper) equally with plugin directory presence.

---

### CRITICAL #4: 5 exclusive analytics views are valued (Assumption #4)

**The assumption:** MCA Biplot, MDS Map, Lag Sequential Analysis, Polar Coordinates, and CHAID Decision Tree are meaningful differentiators that researchers want built into their QDA tool.

**Why it's critical:** These analytics are heavily featured in positioning, messaging, and battlecards. If researchers don't know what MCA is (or don't want it inside their coding tool), the primary differentiator falls flat.

**Evidence for:** The Foundations.md theoretical work shows these techniques are legitimate mixed methods tools. The market research confirms no competitor offers them built-in.

**Evidence against:** "No competitor offers them" could mean "no one wants them" rather than "opportunity." Most qualitative researchers use thematic analysis (Braun & Clarke), not MCA or lag sequential analysis. The 5 exclusive views may serve a tiny methodological niche.

**Validation plan:**
1. Check: how many published studies use MCA in qualitative contexts? Search Google Scholar for "MCA" + "qualitative" + "mixed methods"
2. Ask Prof. Lucas persona equivalent: "Would you use MCA biplots if they were built into your QDA tool?"
3. If analytics are niche: reposition them as "advanced capabilities for mixed methods researchers" rather than leading differentiator. Lead with the 7-engine coverage instead.

---

### CRITICAL #5: AI-assisted coding is feasible local-first (Assumption #11)

**The assumption:** Ollama or a similar local LLM can be integrated into Obsidian with acceptable latency, memory footprint, and code suggestion quality for qualitative data.

**Why it's critical:** AI-Assisted Coding scored 62/70 — it's the #1 feature priority. The entire competitive narrative ("AI that respects your methodology, locally") depends on this being technically feasible.

**Evidence for:** Ollama runs on consumer hardware. Electron/Node.js can make HTTP requests to localhost. Other Obsidian plugins use local AI (e.g., Obsidian Copilot).

**Evidence against:** Qualitative code suggestion is harder than code completion — it requires understanding context, methodology, and research questions. Small local models (7B parameters) may produce irrelevant suggestions. Large models (70B) require 40GB+ RAM.

**Validation plan:**
1. Technical spike (1 week): Install Ollama, try 3 models (Mistral 7B, Llama 3 8B, Phi-3) on real interview transcript data
2. Test: given a coded paragraph, can the model suggest relevant codes from the existing codebook?
3. Measure: latency, RAM, suggestion quality (researcher judges relevance on 1-5 scale)
4. If local is too slow/poor: offer optional cloud API (OpenAI/Anthropic) with explicit user consent, alongside local fallback
5. If neither works well: reframe as "AI-surfaced patterns" (text search, co-occurrence highlights) rather than code suggestion

---

### CRITICAL #6: Researchers will trust a solo-developer plugin (Assumption #5)

**The assumption:** PhD students and postdocs will entrust months of irreplaceable coding work to a free, unlisted, single-maintainer Obsidian plugin.

**Why it's critical:** If the trust barrier is real, no amount of features will drive adoption. Researchers risk losing months of work if the plugin breaks or is abandoned.

**Evidence for:** Synthetic users research: "researchers tolerate tooling risk IF interoperability and data safety are guaranteed." JSON storage is transparent and recoverable.

**Evidence against:** "Tolerate risk" in a hypothetical interview ≠ "commit real dissertation data." The gap between stated preference and behavior is well-documented in research.

**Validation plan:**
1. Recruit 3-5 beta testers with REAL research projects (not toy data)
2. Observe: do they commit fully or keep a parallel CAQDAS project as backup?
3. Track: what makes them trust (or not trust)? Is it export capability? Git versioning? Active GitHub responses?
4. If trust is the blocker: prioritize REFI-QDA export (escape hatch) and visible GitHub activity (responsive maintainer signal) over new features

---

## Summary: Validation Priority Queue

| Priority | Assumption | Validation Method | Time | Blocks |
|:--------:|-----------|-------------------|------|--------|
| **1** | Solo dev capacity (#14) | Hour mapping exercise | 1 hour | Everything |
| **2** | Target audience exists (#1) | Survey + desk research | 2 weeks | GTM strategy |
| **3** | AI feasibility (#11) | Technical spike with Ollama | 1 week | AI feature roadmap |
| **4** | Discovery channel (#3) | Check Quadro download stats | 1 hour | GTM weighting |
| **5** | Analytics valued (#4) | Google Scholar search + researcher interview | 1 week | Messaging hierarchy |
| **6** | Trust barrier (#5) | Beta testers with real projects | 4 weeks | Adoption |

**Rule of thumb:** If #1 (capacity) and #2 (audience exists) fail, stop everything else and rethink. These are existential assumptions.

---

*Assumption map generated 2026-03-03. Analyzed: PMM-STRATEGY.md (718 lines) + Gap Analysis (370 lines). Method: assumption-mapper skill with Confidence/Impact scoring.*
