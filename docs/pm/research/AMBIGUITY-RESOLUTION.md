# Ambiguity Resolution — Critical Assumptions

**Date:** 2026-03-03
**Purpose:** Transform the 3 most critical assumptions from the Assumption Map into structured problem briefs with explicit research questions. These questions double as interview/survey guides for user research (synthetic or real).

---

## Brief 1: "Qualitative researchers already use Obsidian"

*Source: Assumption Map CRITICAL #1 (Confidence 2, Impact 5)*

### Restated as Questions

1. **What percentage of qualitative researchers use ANY personal knowledge management tool** (Obsidian, Notion, Roam, Logseq, paper notebooks, none)?
2. **Among those who use a PKM tool, what percentage use Obsidian specifically** vs Notion/other?
3. **Among Obsidian users, what percentage do qualitative research** (not just note-taking, but actual coding/analysis of data)?
4. **Would a QDA plugin be a reason to ADOPT Obsidian**, or does it only serve people already there?
5. **What is the current workflow** when researchers want to connect their coding (ATLAS.ti/NVivo) with their thinking (notes/memos)? Is there friction? How much?

### Unstated Assumptions to Surface

- We assume "Obsidian user" and "qualitative researcher" overlap at meaningful scale. The actual overlap could be <1,000 people globally.
- We assume researchers who use Obsidian for literature review ALSO want coding inside it. They might prefer Obsidian for thinking and a separate tool for systematic coding.
- We assume the "synthesis-first workspace complementary to CAQDAS" finding from synthetic users generalizes to real researchers. It might be an artifact of the synthetic user design.
- We assume researchers choose tools individually. In reality, advisors, departments, and funding bodies heavily influence tool adoption.

### Scope

**In scope:**
- PKM tool usage among qualitative/mixed methods researchers
- Obsidian penetration in academic research communities
- The coding-to-thinking workflow gap (do researchers feel it? how do they cope?)
- Willingness to adopt Obsidian for QDA specifically

**Out of scope:**
- Obsidian usage among non-researchers (general productivity users)
- Quantitative-only researchers
- Tool pricing sensitivity (covered separately)
- Specific Qualia features (don't introduce the product yet — measure the need first)

**Decision this feeds into:** Is Qualia's TAM (total addressable market) large enough to justify the current strategy? If the overlap is <1,000 researchers, the GTM changes fundamentally — from "serve existing Obsidian users" to "convince researchers to adopt Obsidian."

**Decision owner:** Developer (solo)
**Timeline:** Validate within 2 weeks — this determines whether the entire GTM is viable.

### Minimum Viable Research

| # | Activity | Time | What It Tells Us | What It Doesn't Tell Us |
|---|----------|------|-----------------|------------------------|
| 1 | **Survey on r/qualitativeresearch** (n=30-50): "What tools do you use for (a) qualitative coding and (b) note-taking/knowledge management? List all." Do NOT mention Obsidian or Qualia. | 3 days (draft + post + wait for responses) | Obsidian's penetration in QDA community. Whether PKM tools are used at all. What the current stack looks like. | Whether Obsidian users would actually install a QDA plugin (stated vs revealed preference). Sample bias: Reddit users skew technical. |
| 2 | **Google Trends comparison**: "obsidian qualitative research" vs "nvivo qualitative research" vs "atlas.ti qualitative research." Also: "obsidian academic" trend over 24 months. | 30 minutes | Relative search volume. Whether "obsidian + qualitative" is growing or flat. | Absolute numbers. Intent behind searches. Whether searchers are potential users or just curious. |
| 3 | **Obsidian Forum thread analysis**: Count active users in academic threads ([Research/PhD thread](https://forum.obsidian.md/t/research-phd-academics/1446), [qualitative writing thread](https://forum.obsidian.md/t/sharing-best-practices-on-academic-writing-research-papers-qualitative/76627)). How many unique posters? How recent is activity? | 1 hour | Whether Obsidian's academic community is active or dormant. Rough floor estimate of academic users who self-identify. | Silent users (many academics read but don't post). Whether academic Obsidian users do qualitative coding specifically. |

### Proposed Check-in

After Activity 1 (survey results in, ~5 days): If <5% of respondents use Obsidian, reconsider whether the primary ICP should be "Obsidian-using researchers" or "researchers willing to try Obsidian." If >15% use Obsidian, proceed with current GTM. If 5-15%, the strategy works but growth will be slower than projected.

### Research Questions for User Interview

If running a follow-up interview (synthetic or real) based on these findings:

1. "Walk me through what happens after you finish coding an interview in [their CAQDAS tool]. Where do the insights go?"
2. "Do you use any note-taking or knowledge management tool alongside your coding tool? Which one? Why that one?"
3. "Have you ever felt frustrated by the gap between your coding tool and your thinking tool? Can you describe a specific moment?"
4. "If your coding tool lived inside your note-taking tool — same app, same files — would that change how you work? How?"
5. "What would make you trust a new, free coding tool with real research data? What would make you NOT trust it?"

---

## Brief 2: "Solo developer can sustain the 6-month roadmap"

*Source: Assumption Map CRITICAL #2 (Confidence 1, Impact 5)*

### Restated as Questions

1. **How many hours per week can the developer realistically dedicate to Qualia Coding** (not aspirational — actual, accounting for other work, rest, life)?
2. **How many hours does each roadmap deliverable actually require**, broken down by: coding, testing, documentation, content creation, community management?
3. **What is the maximum number of parallel workstreams** that produce quality output without context-switching degradation?
4. **What happens when a critical bug is reported mid-sprint** — does everything else stop? How much buffer exists?
5. **At what point does workload become unsustainable**, and what are the early warning signs (code quality decline, missed deadlines, health impacts)?

### Unstated Assumptions to Surface

- We assume the 6-month plan has ~28 weeks of work at ~4.7 weeks/month. But "weeks of work" assumes focused, uninterrupted time — which rarely exists.
- We assume coding speed from the initial build (28K LOC) predicts future speed. But building new features from scratch is faster than maintaining existing code + building new features + supporting users + creating content.
- We assume the DROP list stays dropped. Scope creep from community requests could re-inflate the backlog.
- We assume no major life events, illness, or burnout over 6 months. This is a bet, not a plan.

### Scope

**In scope:**
- Time audit of available hours
- Effort estimation per deliverable
- Workstream parallelism limits
- Buffer planning for bugs and support

**Out of scope:**
- Hiring or finding contributors (hope, not plan)
- Reducing scope of the plugin itself (the 7 engines exist and must be maintained)
- Monetization as a solution to capacity (free = no revenue to hire)

**Decision this feeds into:** Is the 6-month roadmap realistic at solo capacity? If not, what gets cut? The RICE-IMPACT-MATRIX quadrants (NOW/NEXT/LATER/DROP) were designed with this in mind, but the actual hour mapping hasn't been done.

**Decision owner:** Developer
**Timeline:** Do this exercise BEFORE starting any execution. 1-2 hours.

### Minimum Viable Research

| # | Activity | Time | What It Tells Us | What It Doesn't Tell Us |
|---|----------|------|-----------------|------------------------|
| 1 | **Time audit**: Track actual hours spent on Qualia for 1 week (coding, docs, community, thinking). Compare to plan assumptions. | 1 week (passive tracking) | Real available hours. Whether the 4.7 weeks/month assumption holds. Where time actually goes. | Whether this week is representative. Energy levels (some hours are more productive than others). |
| 2 | **Effort estimation exercise**: For each NOW item, write a pre-mortem: "It's 2 weeks later and this took 3x longer than expected. Why?" List the reasons. Then re-estimate. | 2 hours | More honest effort estimates. Hidden dependencies and blockers. Which items have the most estimation uncertainty. | Actual effort (only building reveals this). Unknown unknowns. |
| 3 | **Burnout risk check**: Rate current energy/motivation on 1-10. Compare to 6 months ago. List the 3 things most likely to cause you to stop working on Qualia. | 30 minutes | Emotional sustainability baseline. Whether the plan is energizing or exhausting. Personal risk factors. | Future energy levels. Whether community traction will renew motivation (it often does). |

### Proposed Check-in

After Activity 2 (effort re-estimation): If the re-estimated NOW quadrant exceeds 12 weeks (vs current 8.25 weeks), cut scope immediately. Recommended cuts in order: (1) reduce tutorial series from 7 to 3 videos, (2) move Memo Universal to NEXT, (3) defer MMIRA abstract if listing prep is consuming all energy.

### Research Questions for Self-Interview

(Yes, the developer should interview themselves honestly.)

1. "In the last month, how many hours did I actually spend coding vs thinking about coding vs doing other work?"
2. "What is the one thing I'm most excited to build? What is the one thing I'm dreading?"
3. "If I could only ship ONE thing in the next 3 months, what would it be and why?"
4. "When was the last time I felt overwhelmed by this project? What triggered it?"
5. "If a stranger looked at my roadmap, what would they say is unrealistic?"

---

## Brief 3: "The 5 exclusive analytics views are valued by researchers"

*Source: Assumption Map CRITICAL #4 (Confidence 2, Impact 4)*

### Restated as Questions

1. **Do qualitative researchers know what MCA, MDS, Lag Sequential Analysis, Polar Coordinates, and CHAID are?** (Awareness test)
2. **Among those who know these techniques, how many currently use them?** In what tools? (Usage test)
3. **Among those who use them, is "built-in to the coding tool" valuable**, or is "export to R/SPSS" an acceptable workflow? (Integration value test)
4. **Would built-in analytics change a researcher's tool choice**, or are they a nice-to-have after the coding workflow is solid? (Priority test)
5. **Are these techniques growing in qualitative/mixed methods curricula**, or are they niche statistical methods that most qual researchers never encounter? (Trend test)

### Unstated Assumptions to Surface

- We assume "no competitor has these built-in" means "opportunity." It could mean "nobody wants them built-in."
- We assume mixed methods researchers are a large enough segment to anchor positioning on. In practice, most qualitative research is thematic analysis (Braun & Clarke), which doesn't use MCA or MDS.
- We assume the value is "don't export to R/SPSS." But researchers who use MCA probably already know R — the export is not that painful for them.
- We assume naming these techniques in marketing materials helps. It might confuse or intimidate researchers who don't recognize the terms.

### Scope

**In scope:**
- Awareness and usage of advanced mixed methods analytics among qualitative researchers
- Whether built-in analytics is a tool selection criterion
- Whether the 5 exclusive views are the RIGHT differentiator to lead with in messaging

**Out of scope:**
- Whether the analytics implementations are statistically correct (separate validation)
- Whether to remove the analytics engine (it exists, it stays — the question is how prominently to position it)
- Comparison with R/Python analytics packages (different audience)

**Decision this feeds into:** Should the 5 exclusive analytics views be the LEAD differentiator in messaging, a SECONDARY feature, or an ADVANCED capability mentioned only in detailed docs? This affects: README structure, demo video script, conference pitches, one-pager.

**Decision owner:** Developer
**Timeline:** 2 weeks (parallel with Brief 1 survey)

### Minimum Viable Research

| # | Activity | Time | What It Tells Us | What It Doesn't Tell Us |
|---|----------|------|-----------------|------------------------|
| 1 | **Google Scholar search**: Count publications using MCA/MDS/LSA in qualitative contexts (2020-2026). Search: "multiple correspondence analysis" + "qualitative" + "mixed methods". Compare to "thematic analysis" volume. | 1 hour | Relative prevalence. Whether MCA/MDS are growing or static in the literature. Which disciplines use them most. | Whether published usage correlates with tool demand. Researchers may cite methods they used in R, not wanting built-in tools. |
| 2 | **Survey question (add to Brief 1 survey)**: "Which of these analysis techniques have you used in your research? (check all that apply): Thematic Analysis, Co-occurrence Matrix, Correspondence Analysis (MCA), Multidimensional Scaling (MDS), Sequential Analysis, Decision Trees, None of the above." | 0 hours (added to existing survey) | Awareness and usage rates in our target audience. Whether these are common or niche. | Whether "used" means "used regularly" or "used once in a methods course." |
| 3 | **Methods syllabus scan**: Find 5 mixed methods course syllabi (Google "mixed methods syllabus filetype:pdf"). Check: are MCA, MDS, or sequential analysis taught? | 1 hour | Whether these techniques are entering curricula (pipeline of future users) or remain advanced/niche. | Whether being taught → wanting built-in tools. Students learn many things they never use in practice. |

### Proposed Check-in

After Activity 2 (survey results): If <10% of respondents have used MCA/MDS/LSA, demote analytics from lead differentiator to advanced capability. Promote "7 data types in one tool" and "coding inside Obsidian" as the lead differentiators instead. If >25% have used them, analytics is a genuine differentiator — keep it prominent.

### Research Questions for User Interview

1. "When you finish coding a dataset, what kind of analysis do you typically run? Walk me through your process."
2. "Have you ever needed to do correspondence analysis or multidimensional scaling on qualitative data? If yes, what tool did you use?"
3. "If your coding tool could show you an MCA biplot of your codes — would you know what to do with it? Would it change your analysis?"
4. "What would be MORE useful to you: advanced statistical views built in, or better basic features like code hierarchy and memos?"
5. "When you see '17 analytics views' in a tool description, does that excite you or overwhelm you?"

---

## Summary: Research Agenda

| Brief | Core Question | Method | Time | Priority |
|:-----:|--------------|--------|:----:|:--------:|
| 1 | Does our audience exist at scale? | Reddit survey + Google Trends + Forum analysis | 1 week | **P0** |
| 2 | Can one person do this? | Time audit + effort re-estimation + burnout check | 1 week | **P0** |
| 3 | Are analytics the right differentiator? | Scholar search + survey add-on + syllabus scan | 1 week | **P1** |

**Briefs 1 and 2 are existential** — if the audience is too small or the developer burns out, nothing else matters. Brief 3 affects messaging but not viability.

**Total research time:** ~2 weeks, mostly passive (waiting for survey responses). Can run all 3 in parallel.

### Combined Survey Draft (for Brief 1 + Brief 3)

Post on r/qualitativeresearch, QUALRS-L, and r/AcademicPhilosophy:

> **Title:** Quick survey for qualitative/mixed methods researchers — what tools do you use? (5 min)
>
> Hi! I'm researching tool usage patterns among qualitative and mixed methods researchers. This is for a personal research project, not commercial.
>
> **5 questions:**
>
> 1. What is your primary qualitative coding tool? (NVivo / ATLAS.ti / MAXQDA / Dedoose / QualCoder / Taguette / Other: ___ / I don't use one)
>
> 2. What do you use for note-taking / knowledge management alongside your coding tool? (Obsidian / Notion / Roam / OneNote / Word / Paper notebooks / Other: ___ / Nothing separate)
>
> 3. How do you move insights from your coding tool to your thinking/writing space? (Manual copy-paste / Export + import / Screenshots / I don't — I work entirely in one tool / Other: ___)
>
> 4. Which of these analysis techniques have you used in your research? (check all): Thematic Analysis / Grounded Theory coding / Co-occurrence matrix / Correspondence Analysis (MCA) / Multidimensional Scaling (MDS) / Sequential Analysis / Decision Trees / None of the above
>
> 5. What is the ONE thing you wish your current coding tool did better?
>
> Thank you! Happy to share results with the community.

This survey validates Briefs 1 and 3 simultaneously without mentioning Obsidian's name in the title or revealing that a product exists.

---

*Generated 2026-03-03. Based on Assumption Map CRITICAL assumptions #1, #2, #4. Questions designed to serve as both strategic validation and user research interview guides.*
