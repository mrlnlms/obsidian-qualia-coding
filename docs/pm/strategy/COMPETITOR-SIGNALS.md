# Competitive Intelligence Report — March 2026

**Date:** 2026-03-03
**Product:** Qualia Coding
**Sources:** Competitor profiles, landscape analysis, gap analysis, PMM strategy, web research
**Period covered:** Sept 2024 — March 2026

---

## Signal #1: Lumivero acquires ATLAS.ti

**Competitor:** Lumivero (NVivo parent)
**Signal:** Lumivero (TA Associates PE) acquired ATLAS.ti in September 2024. One company now owns the #1 and #2 QDAS tools globally.
**Signal Type:** Partnership / Acquisition
**Reactive or Proactive:** Proactive — classic PE roll-up strategy to consolidate market and increase pricing power.
**Threat Level:** **Watch** (opportunity disguised as threat)

**Implication for Qualia:**
- Researchers wary of monopoly consolidation may actively seek independent alternatives
- Price increases are likely (PE extraction model) — widens the "free vs $500+" gap
- Product rationalization risk: Lumivero may merge features, sunset one product, or homogenize both
- MAXQDA is now the **only independent** traditional QDAS vendor — they will absorb defectors first, not Qualia
- The narrative "independent, open-source, no vendor lock-in" gains emotional resonance

**Recommended Response:** Monitor. Use in messaging ("Your data shouldn't depend on private equity decisions"). Do NOT position as anti-Lumivero — position as pro-independence. Timeline: ongoing.

---

## Signal #2: ATLAS.ti goes all-in on OpenAI

**Competitor:** ATLAS.ti
**Signal:** Since v24, every major release is AI-focused: AI transcription (30+ langs), AI coding with granularity slider, conversational AI (chat with documents), sentiment analysis, AI summaries. All built on OpenAI. Token-metered.
**Signal Type:** Product
**Reactive or Proactive:** Proactive — ATLAS.ti is betting its future on AI as primary differentiator.
**Threat Level:** **Medium**

**Implication for Qualia:**
- Sets market expectation: "a QDA tool should have AI." Not having AI in 2026 makes Qualia look behind even FOSS competitors (QualCoder added AI in 2025)
- BUT: ATLAS.ti's approach has three exploitable weaknesses:
  1. **Token-metered** — artificial scarcity, unpredictable costs
  2. **Cloud-dependent** — data goes to OpenAI servers (IRB/ethics concern)
  3. **Epistemologically contested** — Jowsey et al. (2025) explicitly rejects GenAI for reflexive qualitative research
- The opening is NOT "we have AI too" but "we have AI that respects your methodology"
- ATLAS.ti release cadence has slowed post-acquisition: only 3 releases in 14 months (v25.0.0 through v25.0.2). Integration overhead may be absorbing engineering capacity.

**Recommended Response:** Accelerate AI-Assisted Coding (roadmap #1, WINNING 62/70). Differentiate on LOCAL-FIRST (Ollama, no tokens, no cloud). Frame as "AI that amplifies, doesn't substitute." Timeline: months 2-4.

---

## Signal #3: MAXQDA adds multi-document AI coding (Feb 2026)

**Competitor:** MAXQDA
**Signal:** Version 26.1 (Feb 2026) adds multi-document AI coding — find passages matching a code across entire corpus, not just single documents. Also: AI translation and expanded transcription languages (Bashkir, Irish, Maltese, Persian).
**Signal Type:** Product
**Reactive or Proactive:** Reactive — catching up to ATLAS.ti's AI lead while keeping AI as paid add-on (€120/yr).
**Threat Level:** **High**

**Implication for Qualia:**
- MAXQDA is our highest-threat competitor (Capterra 4.7/5, mixed methods gold standard, gentlest learning curve)
- Multi-document AI coding is a powerful feature: researchers can say "find all passages about X across 50 interviews"
- AI as paid add-on (€120/yr) vs Qualia's planned free local-first AI = pricing leverage
- BUT: MAXQDA is NOT hiring AI/ML engineers (per job postings) — their AI is API-dependent, not proprietary. Same vulnerability as ATLAS.ti.
- The subscription transition (killed perpetual licenses) is creating friction with loyal academic users — potential defectors

**Recommended Response:** Accelerate AI-Assisted Coding. When implemented, create a specific "MAXQDA AI Assist vs Qualia AI" comparison showing: free vs €120/yr, local vs cloud, researcher-controlled vs automated. Timeline: months 2-4.

---

## Signal #4: MAXQDA hiring DevOps/SRE + Financial Analyst

**Competitor:** MAXQDA (VERBI)
**Signal:** Open positions for DevOps/SRE (AWS, Kubernetes, Terraform) and Financial Analyst (subscription metrics: churn, LTV, CAC). No AI/ML engineer postings.
**Signal Type:** Hiring
**Reactive or Proactive:** Proactive — investing in cloud infrastructure (TeamCloud, Tailwind) and subscription business metrics.
**Threat Level:** **Watch**

**Implication for Qualia:**
- MAXQDA is building cloud infrastructure — TeamCloud and MAXQDA Tailwind (cloud AI platform) are strategic bets
- The Financial Analyst hire signals subscription model is new territory for them — they're learning SaaS metrics
- **No AI/ML engineers** = their AI features are third-party API calls (OpenAI/Anthropic), not proprietary models. This means:
  - They can't differentiate on AI quality, only on UX of AI integration
  - They're exposed to the same API costs and privacy concerns as ATLAS.ti
  - A local-first approach (Qualia) would be genuinely different architecture, not just different UI

**Recommended Response:** Monitor. Note the cloud investment — MAXQDA moving to web would close Qualia's "runs everywhere" advantage (currently MAXQDA is desktop-only). If MAXQDA launches a web version, Qualia's Obsidian-native positioning needs reinforcement. Timeline: quarterly check.

---

## Signal #5: NVivo 15.3 adds AI summaries + Mac parity push

**Competitor:** NVivo (Lumivero)
**Signal:** Version 15.3 (Dec 2025) adds AI-generated summaries for codes, cases, and Framework Matrix cells. Also: Framework Matrix on Mac (closing longstanding platform gap). Admin AI controls (institutional kill switch for IRB compliance).
**Signal Type:** Product
**Reactive or Proactive:** Reactive — playing catch-up on AI while maintaining conservative, institutional-friendly posture.
**Threat Level:** **Low**

**Implication for Qualia:**
- NVivo's AI approach is the most conservative: summaries and suggestions only, with admin kill switches
- This validates Qualia's planned approach: "AI that respects institutional constraints"
- The admin kill switch is interesting — it acknowledges that many institutions DON'T WANT AI in research tools. This supports Qualia's non-AI status quo as defensible for IRB-regulated research.
- Mac parity push means NVivo users on Mac have fewer reasons to switch
- NVivo's SaaS direction (CEO signaled post-acquisition) is still vaporware — no web product exists

**Recommended Response:** No action needed. NVivo is moving slowly on AI. Their institutional lock-in remains their moat — Qualia should not try to compete for site-licensed institutions. Focus on individual researchers. Timeline: monitor quarterly.

---

## Signal #6: QualCoder adds AI-assisted coding (v3.6-3.7, 2025)

**Competitor:** QualCoder (open source)
**Signal:** QualCoder v3.6-3.7 added AI-assisted coding and AI chat with multi-model support (OpenAI, Gemini, Claude, Mistral, DeepSeek, Ollama offline).
**Signal Type:** Product
**Reactive or Proactive:** Proactive — FOSS QDA tool beating commercial competitors to multi-model AI.
**Threat Level:** **Medium**

**Implication for Qualia:**
- QualCoder is the most feature-comparable open-source competitor (text, image, audio, video)
- They shipped multi-model AI BEFORE Qualia, BEFORE MAXQDA's multi-doc coding, and with Ollama (local) support
- This demolishes Qualia's "only free tool with..." narrative for AI — QualCoder already does it free + local
- QualCoder does NOT have: CSV/Parquet coding, built-in analytics (MCA/MDS/etc), Research Board, margin bars, Obsidian integration. These remain differentiators.
- The multi-model approach (not locked to OpenAI) validates Qualia's planned local-first direction

**Recommended Response:** Accelerate AI-Assisted Coding. Study QualCoder's implementation for UX patterns. When shipping, emphasize integration advantage: "AI coding inside your vault, alongside your notes, connected to your graph — not in a standalone Python app." Timeline: months 2-4.

---

## Signal #7: ATLAS.ti data loss reports in user reviews

**Competitor:** ATLAS.ti
**Signal:** G2 and Capterra reviews report ~80% of quotations and codes disappearing after updates. Transcript loss requiring repurchase of transcription credits. Multiple corroborating reports.
**Signal Type:** Product (negative)
**Reactive or Proactive:** N/A — unforced error.
**Threat Level:** **Opportunity**

**Implication for Qualia:**
- Data loss is the worst possible failure for a research tool. Months of coding work = irreplaceable
- Qualia's file-based storage (JSON in vault) is architecturally immune to this class of failure
  - JSON is human-readable and recoverable
  - Vault can be versioned with Git
  - No proprietary database that can corrupt
- This is a powerful trust argument, especially for researchers who have heard the horror stories

**Recommended Response:** Use in messaging and battlecards (already done). When speaking to researchers who use ATLAS.ti, ask: "How do you back up your ATLAS.ti project?" Then explain JSON-in-vault. Do NOT gloat about competitor failures — frame as architectural advantage. Timeline: ongoing.

---

## Signal #8: Quadro listed in Obsidian Community Plugin Directory

**Competitor:** Quadro (Obsidian plugin)
**Signal:** Quadro is already listed and discoverable in the Obsidian Community Plugin Directory. Qualia is not.
**Signal Type:** Product / Distribution
**Reactive or Proactive:** Proactive (Quadro) — they claimed the "Obsidian QDA" slot first.
**Threat Level:** **High** (for distribution, not for features)

**Implication for Qualia:**
- Every day Qualia is unlisted, Quadro accumulates installs, reviews, and mind-share as "the Obsidian QDA plugin"
- Researchers who try Quadro first and find it sufficient for text-only coding will not search further
- Quadro's simplicity is a feature: markdown-only, wikilink codes, native Obsidian feel. Some users will prefer this.
- The ~2.1 MB bundle size differential (Qualia) vs tiny size (Quadro) may matter in community review
- Quadro's listing is also proof that the Obsidian community will accept QDA plugins

**Recommended Response:** **Accelerate community plugin listing** — this is the single highest-leverage action. Every week of delay compounds Quadro's first-mover advantage. Timeline: month 1 (immediate).

---

## Signal #9: AI-native tools growing (Dovetail, Marvin, CoLoop, Looppanel)

**Competitor:** Multiple AI-native QDA tools
**Signal:** A new category of tools is emerging: AI-native UX/product research platforms (Dovetail, Marvin, CoLoop, Looppanel, Usercall, Quals AI). They promise end-to-end automation, "80% reduction in analysis time," and "brief to insights in 24 hours."
**Signal Type:** Market / Messaging
**Reactive or Proactive:** Proactive — defining a new category.
**Threat Level:** **Low** (different market segment)

**Implication for Qualia:**
- These tools target product/UX teams, not academic researchers. Minimal direct competition.
- BUT they set market EXPECTATIONS: "AI should do the coding for me." This expectation will seep into academic discourse.
- The academic counter-argument is strong: Jowsey et al. (2025) rejects GenAI for reflexive qualitative research. The interpretive act of coding IS the analysis.
- Qualia's positioning ("coding as thinking") is the antithesis of "brief to insights in 24 hours" — and that's the point.

**Recommended Response:** Monitor but do not compete. Qualia's audience values methodological rigor over speed. The AI-native tools validate AI demand but serve a different epistemological framework. Use their existence in messaging: "If you want AI to do your analysis, there are tools for that. If you want AI to support YOUR analysis, that's what Qualia does." Timeline: no action.

---

## Signal #10: MAXQDA eliminates perpetual licenses, moves to subscription-only

**Competitor:** MAXQDA
**Signal:** MAXQDA dropped version-numbered releases (no more "MAXQDA 2024") and eliminated perpetual licenses entirely. Continuous subscription model as of version 26.0.
**Signal Type:** Pricing
**Reactive or Proactive:** Proactive — following industry trend to recurring revenue. Accelerated by cloud infrastructure investment (TeamCloud).
**Threat Level:** **Opportunity**

**Implication for Qualia:**
- Academic users with long memories remember paying once for MAXQDA and using it for years
- Forced subscription creates resentment, especially among:
  - Researchers between grants (no funding for ongoing software costs)
  - Students who bought perpetual licenses and now face annual renewals
  - Developing-world institutions where EUR 253/yr is significant
- Qualia is free forever. This message lands harder when the alternative just got more expensive.
- MAXQDA's subscription friction + Lumivero's consolidation = two simultaneous pushes that may create a migration moment

**Recommended Response:** Emphasize "free forever" in all messaging targeting MAXQDA users. Create a "Switching from MAXQDA" guide (planned in Content Calendar week 8). When REFI-QDA export is implemented, announce it specifically as "bring your MAXQDA project to Qualia — no subscription required." Timeline: content in month 2, REFI-QDA when implemented.

---

## Signal #11: OpenQDA emerging with REFI-QDA support

**Competitor:** OpenQDA (University of Bremen)
**Signal:** OpenQDA is a new open-source QDA tool (PHP + plugins, AGPL-3.0) with collaborative architecture and REFI-QDA support. Still in early access.
**Signal Type:** Product
**Reactive or Proactive:** Proactive — academic-led open-source QDAS project.
**Threat Level:** **Watch**

**Implication for Qualia:**
- OpenQDA is the only other open-source QDAS with a plugin architecture — philosophically similar to Qualia
- Their REFI-QDA support signals the standard is gaining traction in FOSS
- They are web-based (PHP), not desktop/Obsidian — different niche
- Potential for collaboration rather than competition: shared REFI-QDA standard, cross-referencing in academic papers
- If OpenQDA matures and gets traction, it validates the "open-source QDA is viable" category — which benefits Qualia too

**Recommended Response:** Monitor and consider collaboration. Implement REFI-QDA export partly to enable data exchange with OpenQDA. Cite them in Qualia's methods paper as a peer in the open-source QDA movement. Timeline: quarterly check.

---

## Signal #12: CAQDAS Networking Project (Surrey) trains 7,000+ researchers

**Competitor:** Not a competitor — a gatekeeper
**Signal:** The CAQDAS Networking Project at University of Surrey (led by Christina Silver) has been the software-neutral QDA advisory body since 1994. They train thousands of researchers, provide impartial guidance, and run webinars on YouTube.
**Signal Type:** Partnership / Ecosystem
**Reactive or Proactive:** N/A — they are an evaluator, not a competitor.
**Threat Level:** **Opportunity**

**Implication for Qualia:**
- Getting Qualia reviewed/listed by the CAQDAS Networking Project would be a massive credibility signal
- Christina Silver is active on Bluesky (`@christinaqdas.bsky.social`) — reachable
- Their keynote at MAXDAYS 2026 shows they engage with commercial tools; they should engage with FOSS too
- If they recommend Qualia in their training materials, it reaches thousands of researchers annually

**Recommended Response:** Email Christina Silver / CAQDAS Networking Project requesting review (template in Outreach Playbook). This is a high-ROI outreach action. Timeline: Q2 2026.

---

## Signal #13: REFI-QDA standard gaining traction

**Competitor:** Ecosystem-wide
**Signal:** REFI-QDA (Research Exchange Format for Qualitative Data Analysis) is supported by NVivo, ATLAS.ti, MAXQDA, QDA Miner, Quirkos, and now OpenQDA. Born at KWALON 2016. Openly documented XML format.
**Signal Type:** Partnership / Ecosystem
**Reactive or Proactive:** Market-wide standard adoption.
**Threat Level:** **Medium** (barrier to entry if not supported)

**Implication for Qualia:**
- Without REFI-QDA: Qualia is an island. Researchers cannot import existing projects or export for colleagues using other tools.
- With REFI-QDA: Qualia becomes part of the ecosystem. Migration from incumbents becomes possible. Credibility in academic methods community increases.
- The gap analysis elevated REFI-QDA from Low to Medium-High priority for this reason
- Implementation complexity: mapping 7 marker types (MD, PDF text, PDF shape, CSV row, CSV segment, Image, Audio/Video) to QDPX XML is non-trivial

**Recommended Response:** Implement REFI-QDA export as a medium-term priority (after AI coding and ICR). Start with export-only (less scope than import). Focus on text markers first, then expand to multimedia. Timeline: months 4-6.

---

## Strategic Summary

### The landscape in one paragraph

The QDAS market is consolidating at the top (Lumivero owns NVivo + ATLAS.ti) and fragmenting at the bottom (QualCoder, OpenQDA, AI-native tools). AI is becoming table stakes across all tiers — even FOSS tools have it now. MAXQDA is the strongest independent competitor, adding AI coding and cloud features while alienating some users with subscription-only pricing. The most dangerous near-term signal is **QualCoder shipping multi-model AI (including Ollama local) before Qualia** — this erodes Qualia's planned "local-first AI" differentiator unless Qualia ships soon. The most dangerous structural signal is **Quadro's community listing first-mover advantage** — every week Qualia is unlisted, Quadro owns the "Obsidian QDA" mental slot.

### Three things to do immediately

1. **Submit community plugin listing** — stop the Quadro first-mover bleed
2. **Begin AI-Assisted Coding spike** — QualCoder already shipped local AI; Qualia risks being third (after QualCoder and MAXQDA) if it delays
3. **Email CAQDAS Networking Project** — a single credibility signal that reaches thousands of researchers

### Three things to watch quarterly

1. **MAXQDA web version** — if they launch a browser-based MAXQDA, Qualia's cross-platform argument weakens
2. **NVivo SaaS** — CEO signaled it; no product yet. If it launches, institutional lock-in strengthens
3. **OpenQDA maturation** — potential collaborator or competitor depending on their trajectory

---

## Signal Monitoring Cadence

| Frequency | What to check | How |
|-----------|--------------|-----|
| Monthly | ATLAS.ti release notes | [atlasti.com/updates](https://atlasti.com/updates) |
| Monthly | MAXQDA release notes | [maxqda.com/blogpost](https://www.maxqda.com/blogpost) |
| Monthly | QualCoder GitHub releases | [github.com/ccbogel/QualCoder/releases](https://github.com/ccbogel/QualCoder/releases) |
| Monthly | Quadro GitHub + Obsidian stats | [github.com/chrisgrieser/obsidian-quadro](https://github.com/chrisgrieser/obsidian-quadro) |
| Quarterly | NVivo release notes | [lumivero.com/resources/blog](https://lumivero.com/resources/blog/) |
| Quarterly | MAXQDA job postings | [maxqda.com/about/jobs](https://www.maxqda.com/about/jobs) |
| Quarterly | OpenQDA progress | [openqda.org](https://openqda.org/) |
| Quarterly | REFI-QDA standard updates | [qdasoftware.org](https://www.qdasoftware.org/) |
| Biannually | AI-native tool landscape | Search Product Hunt, G2 for new QDA/research tools |
| Biannually | Obsidian ecosystem (new QDA plugins) | Obsidian Community Plugin Directory search |

---

*Report generated 2026-03-03. Based on competitor profiles, landscape analysis, gap analysis, and PMM strategy produced in same session.*
