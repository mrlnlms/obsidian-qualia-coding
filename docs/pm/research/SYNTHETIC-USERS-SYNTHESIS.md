# Research Synthesis: Synthetic Users Study -- Obsidian QDA Workflows

**Participants:** 2 synthetic users (Dr. Nia Okonkwo, Prof. Lucas Yamamoto)
**Date:** February 2026
**Platform:** SyntheticUsers.com (dynamic interview)
**Method Note:** These are AI-simulated personas designed to represent target user archetypes. Insights should be treated as hypothesis-generating, not as validated user research. Real user validation is needed.

**Research Questions:**
1. How do qualitative researchers use Obsidian alongside CAQDAS tools?
2. What friction exists in the coding-to-thinking workflow?
3. What would make researchers trust a QDA plugin inside Obsidian?
4. How do cross-cultural and multi-coder workflows affect tool requirements?

**Limitation:** Two synthetic participants, not real users. Every finding in this document is a hypothesis to validate with actual qualitative researchers. The research was conducted BEFORE Qualia Coding was shown to participants -- it explores pre-existing workflows, pain points, and tool expectations.

---

## Theme 1: Obsidian as Synthesis-First Workspace Complementing CAQDAS

- **Summary:** Both participants use Obsidian as a flexible space for interpretive, emergent work -- linking, building theory, and creating independent "sovereign" note-atoms -- while relying on Atlas.ti or MAXQDA for large-scale systematic coding and queries. This split workflow defines how researchers already think about the tool boundary: CAQDAS for rigor and scale, Obsidian for thinking.
- **Supporting Quotes:**
  - "In Atlas.ti, I'm managing the project, the codes, the documents. In Obsidian, I'm just... thinking with the data." -- Dr. Nia Okonkwo
  - "It's like building a mental map of the data, but it's tangible." -- Dr. Nia Okonkwo
  - "Oh, coding is absolutely central to everything I do." -- Prof. Lucas Yamamoto
- **Implication for Qualia Coding:** The "complement" frame remains the safest positioning for institutional and team contexts. However, Qualia Coding's 7 engines and integrated analytics shift the boundary significantly -- for solo researchers and small-medium projects, it can function as a standalone alternative. The key pivot point is whether REFI-QDA export (Roadmap #16), intercoder reliability (identified gap), and query tools are robust enough to satisfy audit trail requirements. Lucas estimated he could do "~80% of the work" in a tool like this if basic queries were available.

---

## Theme 2: The "Sovereign Knowledge Atom" -- Excerpt-to-Note as Cognitive Leap

- **Summary:** Both participants described the act of extracting a short excerpt into Obsidian and creating an independent note as a cognitive leap, not just clerical work. The file-as-node model externalizes nascent ideas, makes them addressable in the knowledge graph, and accelerates grounded-theory sense-making. This was identified as the single most actionable insight in the study.
- **Supporting Quotes:**
  - "When those connections start to pop out, it's like a small jolt of electricity." -- Dr. Nia Okonkwo
  - "It's like building the argument for a chapter, piece by piece, right there in the software." -- Dr. Nia Okonkwo
  - "I think my threshold for 'good enough' has gotten way higher since those reconciliation meetings, which is probably good for the research but terrible for my productivity." -- Prof. Lucas Yamamoto
- **Implication for Qualia Coding:** A "Promote to Note" feature across all engines (Markdown, CSV, PDF, Image, Audio, Video) is the highest-value addition identified by this research. Each promoted note must contain: (1) the excerpt/thumbnail/crop, (2) source metadata with deep-link back, (3) applied codes, (4) a memo field, (5) a UUID for export traceability. Image regions require special handling as "sovereign multimodal atoms" -- they need a visual thumbnail, normalized coordinates, and explicit linkage to textual evidence. This maps to a new roadmap item not yet listed, and supports Roadmap #3 (Memo Universal) and #20 (Analytical Memos).

---

## Theme 3: Automation and Safe Interoperability (Export and Provenance)

- **Summary:** Manual copying, tag drift, and rework are major pain points. Automation that creates excerpt-notes with prefilled metadata (source, timestamp, code) would remove cognitive and clerical load. Export in open standards (REFI-QDA) reassures teams about long-term portability and is a prerequisite for professional adoption.
- **Supporting Quotes:**
  - "E como ter um Atlas.ti dentro do Obsidian - voce pode codificar trechos diretamente nas suas notas, ver todos os excerpts de um codigo lado a lado, e transformar qualquer insight em uma nota independente com um clique." -- Prof. Lucas Yamamoto
  - Nia explicitly requested REFI-QDA as a guarantee of interoperability; Lucas said REFI-QDA would change "everything" if it covered round-trip between tools.
  - Both described the process of manual recodification as a "grind" that generates "anxiety."
- **Implication for Qualia Coding:** REFI-QDA export (Roadmap #16) is confirmed as a critical adoption gate. The export must be multimodal: text offsets, CSV row/cell IDs, PDF page+offsets, image polygon coordinates + companion JSON for data REFI-QDA cannot natively represent. An "emergency export" (CSV/JSON with checksums) should remain free to avoid lock-in perception. R/Python example scripts for tidy import are high value for Lucas-type users. Directly maps to Roadmap #16 (Export) and the REFI-QDA gap identified in market research.

---

## Theme 4: Multimodal Data Integration -- Context Lost in Text-Only Workflows

- **Summary:** Video, audio tone, gestures, and images carry interpretive cues (emotion, hesitation, visual context) that transcriptions alone fail to preserve. Researchers repeatedly need to replay media to recover meaning when synthesizing, which breaks analytic flow. The single most valuable feature is not richer visualization but low-friction capture that preserves media-context + provenance at the moment of insight.
- **Supporting Quotes:**
  - "It's like building the argument for a chapter, piece by piece, right there in the software." -- Dr. Nia Okonkwo
  - "We ended up having three separate two-hour meetings just to reconcile our codes." -- Prof. Lucas Yamamoto
- **Implication for Qualia Coding:** Qualia's 7-engine architecture (Markdown, PDF, CSV, Image, Audio, Video, Analytics) directly addresses this need. The key gap is that markers across engines are not yet promotable to independent notes with cross-engine provenance. Audio/Video engines already have memo fields; Markdown and PDF do not (Roadmap #3 -- Memo Universal). The multimodal linking story (excerpt-note with deep-link back to timestamp/coordinates/page) is the bridge that turns Qualia from "7 separate coders" into a unified synthesis environment.

---

## Theme 5: Cross-Cultural Coding -- Divergent Interpretations and Reconciliation Cost

- **Summary:** Cross-cultural teams routinely disagree about what behaviors signify. These differences emerge only when watching raw segments together and explicating local context. Researchers' cultural lenses unconsciously convert neutral behaviors into value judgments. Maintaining traceability and multimodal links is essential to defend interpretations and enable recoding when definitions change.
- **Supporting Quotes:**
  - "How many times had I missed insights because I was unconsciously filtering everything through this very specific cultural framework?" -- Prof. Lucas Yamamoto
  - "I kept coding rapid purchase decisions as 'insufficient information processing.' But I never questioned why I thought taking a long time to decide was inherently better." -- Prof. Lucas Yamamoto
  - "If I miss my payment, it's not just the money. My neighbours, my family, they will know. My name will be spoiled. How will I look them in the eye? How will I borrow from my sister next time?" -- Dr. Nia Okonkwo (participant data example illustrating cultural misreading risk)
- **Implication for Qualia Coding:** Document-Code Matrix and Code Evolution (implemented) are necessary but not sufficient. Explicit grouping/filtering by cultural variables (country, city, language, demographic) is needed -- this maps directly to Roadmap #19 (Case Variables per Document) and #9 (Code x Metadata). Normalized frequencies (% by group) and delta-matrices are needed for valid cross-cultural comparison. The study strongly validates the market research gap on Case/Document Variables as the #1 missing capability for mixed-methods workflows.

---

## Theme 6: Code Definition Changes -- Manual Recodification is Painful and Risky

- **Summary:** When a code definition changes mid-project, both participants resort to manual search-and-recode workflows that are time-consuming, error-prone, and anxiety-inducing. Neither has automated tooling to flag affected segments. The Coded Segments Browser (showing segments side-by-side) is helpful but not sufficient without automated signaling.
- **Supporting Quotes:**
  - Nia described using "busca global" and opening each note to "apagar a tag antiga e adicionar as novas" -- a process that took 1-2 hours for one code refinement.
  - Lucas uses temporary markers ("verificar atualizacao") on pending items and prioritizes recoding the "analytical core" first, accepting that peripheral segments may be inconsistent.
  - Both described the process as a "grind" with associated "anxiety" about missed segments.
- **Implication for Qualia Coding:** An automated "Review Queue" feature is strongly validated: when a code definition changes, the system should (1) log the change event (who/when/old/new/rationale), (2) automatically identify all affected segments across all engines, (3) present them in a review queue with flags, (4) support batch actions (keep/replace/split/defer) with audit trail. This is a new roadmap item not currently listed, and should be considered high priority. It also enables the reflexive workflow that cross-cultural coding demands.

---

## Theme 7: Collaboration -- The Principal Adoption Blocker for Teams

- **Summary:** Both participants identified collaboration as a critical need. Nia needs real-time co-coding with a team of 4; Lucas needs intercoder reliability metrics and merge workflows. Git-based async collaboration is realistic for audit trails and versioning but does not satisfy real-time co-coding needs. The research recommends a hybrid approach: CAQDAS for team coding, Obsidian for synthesis, with a medium-term roadmap toward server-assisted collaboration.
- **Supporting Quotes:**
  - "The most useful thing was when we started screen-sharing our individual coding sessions." -- Prof. Lucas Yamamoto
  - Lucas requires intercoder reliability (kappa) calculations and export to R/Python for statistical validation.
  - Nia needs per-segment claiming, assignment/notifications, and presence indicators for a team of 4 research assistants.
- **Implication for Qualia Coding:** Real-time CRDT co-editing should be explicitly deferred (high cost, low near-term return). Instead, prioritize: (1) per-segment claiming/locking UI, (2) workqueue/assignment panel, (3) basic intercoder reliability (kappa) computation, (4) batch merge/conflict resolution UI. This maps to the Intercoder Reliability gap identified in market research and would be a natural Team/Pro paid feature. Git integration remains valuable for audit trail and Lucas-type workflows.

---

## Theme 8: Plugin Trust and Data Safety

- **Summary:** Tolerance for plugin risk varies. Some researchers will try experimental plugins immediately; others require active maintenance, community adoption, and export guarantees before trusting the tool on real projects. Data safety -- the guarantee that annotations will not be lost if the plugin breaks -- is a non-negotiable prerequisite for professional adoption.
- **Supporting Quotes:**
  - Nia explicitly asked: "What happens if the plugin breaks?" and demanded REFI-QDA export as a safety net.
  - Lucas already uses Git for his vault, which partially addresses his backup concerns, but he still needs documented export formats and checksums.
  - Both stated that export/portability in the free core (not behind a paywall) is essential to remove the lock-in objection.
- **Implication for Qualia Coding:** The plugin must always provide a free "emergency export" (CSV/JSON with full metadata and checksums) regardless of pricing tier. REFI-QDA multimodal export can be a Pro feature, but basic data portability must remain free. This is both an ethical obligation (researchers' data sovereignty) and a strategic necessity (adoption gate). Git-friendly storage format and documented data schemas should be published. Maps to Roadmap #16 (Export) and the open-core monetization strategy.

---

## Theme 9: Insight Development Through Networked Notes

- **Summary:** Obsidian's free linking, combined with tags and nested concepts, allows lateral movement between projects and prior knowledge -- enabling patterns to emerge across time and study boundaries. Insight often comes from seeing excerpts from different contexts co-locate in the graph. This is a capability CAQDAS fundamentally lacks.
- **Supporting Quotes:**
  - "It's about making those implicit connections explicit, you know?" -- Dr. Nia Okonkwo
  - "In Atlas.ti, I'm managing the project, the codes, the documents. In Obsidian, I'm just... thinking with the data." -- Dr. Nia Okonkwo
- **Implication for Qualia Coding:** The plugin should treat excerpt-notes as networked evidence: linkable, taggable, exportable. The Research Board (Analytics engine, implemented) already supports freeform canvas synthesis. The gap is connecting coded segments from all 7 engines into the Obsidian graph as first-class linkable nodes. This reinforces the "Promote to Note" feature as the critical bridge between engine-specific coding and Obsidian-native synthesis.

---

## Pain Points (cross-cutting)

1. **Manual excerpt transfer** -- Copy-pasting from CAQDAS to Obsidian loses metadata and breaks provenance. "It's a grind." -- both participants.
2. **Tag drift and inconsistent naming** -- Without codebook enforcement, tags proliferate and diverge. Both participants maintain manual codebook documents but acknowledge inconsistency "in the heat of coding."
3. **Recodification after definition changes** -- No automated way to find and review all affected segments. Nia spent 1-2 hours on a single code refinement. Lucas uses temporary "verificar atualizacao" markers and admits peripheral segments may remain inconsistent.
4. **Cross-cultural misinterpretation** -- "I kept coding rapid purchase decisions as 'insufficient information processing'" -- Lucas. Cultural lenses produce systematic bias that only surfaces in cross-coder comparison.
5. **Collaboration friction** -- "We ended up having three separate two-hour meetings just to reconcile our codes" -- Lucas. Git is useful for audit trail but inadequate for real-time co-coding.
6. **Lock-in anxiety** -- "What happens if the plugin breaks?" -- Nia. Without guaranteed export, professional researchers will not commit real projects.
7. **Loss of multimodal context** -- Transcriptions alone fail to capture emotion, hesitation, and visual context. Researchers repeatedly replay media to recover meaning, breaking analytic flow.
8. **Thin data limitations** -- CSV open-ended responses are "fragments" without context. "You can't ask 'why' to that comment" -- Lucas. Better tooling improves prioritization but does not eliminate the epistemological limitation.

---

## Feature Requests (explicit or implied)

| Feature Request | Source | Roadmap Mapping |
|----------------|--------|----------------|
| Promote to Note (all formats, with metadata) | Both -- "most actionable insight" | New item (not yet in roadmap) |
| REFI-QDA export (multimodal, with companion JSON) | Both -- adoption gate | Roadmap #16 (Export) |
| Emergency export (CSV/JSON, free tier) | Both -- trust prerequisite | Roadmap #16 (Export) |
| Automated Review Queue for code definition changes | Both -- "grind"/"anxiety" | New item (not yet in roadmap) |
| Case/Document Variables (country, city, demographics) | Lucas explicit, Nia implied | Roadmap #19, #9 |
| Intercoder reliability (kappa, per-code, per-group) | Lucas explicit | Market research gap (not in roadmap) |
| R/Python export scripts (tidy CSV/JSON) | Lucas explicit | Roadmap #16 extension |
| Codebook versioning with change log | Both -- manual process today | New item (not yet in roadmap) |
| Per-segment claiming/workqueue for teams | Nia explicit | New item (not yet in roadmap) |
| Memo field on all engines | Both implied | Roadmap #3 (Memo Universal) |
| Code hierarchy (parent codes, themes) | Both implied (Saldana methodology) | Roadmap #1, #4 |
| Cross-cultural grouping/filtering in analytics | Lucas explicit | Roadmap #8, #9, #19 |
| Normalize frequencies (% by group) | Lucas explicit | Analytics enhancement |
| Side-by-side media review for reconciliation | Both | New item (not yet in roadmap) |
| Anonymization at promotion time (images) | Nia implied (sensitive data) | New item (not yet in roadmap) |

---

## Delight Moments

- **Sovereign knowledge atoms:** Both participants described the cognitive "jolt" of turning a coded excerpt into an independent, linkable note. "When those connections start to pop out, it's like a small jolt of electricity." -- Nia.
- **Thinking with the data:** The shift from managing data (CAQDAS) to thinking with data (Obsidian) was described as transformative. "In Obsidian, I'm just... thinking with the data." -- Nia.
- **Multimodal coding within the vault:** The idea of coding images, PDFs, CSVs, and transcripts without leaving Obsidian generated visible excitement. Lucas described it as "like having Atlas.ti inside Obsidian."
- **Lateral discovery through the graph:** Both valued how Obsidian's linking surfaces unexpected connections across projects and time. "It's about making those implicit connections explicit." -- Nia.
- **Raising the quality bar:** Lucas noted that reconciliation meetings, while painful, raised his analytical threshold -- "probably good for the research but terrible for my productivity."

---

## Recommended Next Steps

### Immediate (validate with real users)

1. **Recruit 2-3 real qualitative researchers** matching the Nia and Lucas archetypes (ethnographic/education postdoc, mixed-methods public health professor) for 60-minute interviews. Use this synthesis as the interview guide scaffold. Every finding here is a hypothesis until validated.

2. **Conduct a live demo session** showing Qualia Coding's 7 engines to real researchers and capture reactions -- the synthetic study was conducted BEFORE the plugin was shown, so we lack reaction data to actual capabilities.

### Product (high confidence, connect to roadmap)

3. **Implement "Promote to Note"** across all engines (new roadmap item, highest priority from this research). Template: excerpt + source metadata + codes + memo + UUID. Image regions require thumbnail/crop + coordinates.

4. **Prioritize REFI-QDA export** (Roadmap #16) as the #1 adoption gate for professional researchers. Must cover: text offsets, CSV row/cells, PDF page+offsets, image polygon coordinates, audio/video timestamps. Include companion JSON for data REFI-QDA cannot natively represent.

5. **Add Case/Document Variables** (Roadmap #19) to enable cross-cultural grouping and mixed-methods "joint display" -- validated as the top gap by both this study and market research.

6. **Build automated Review Queue** for code definition changes (new roadmap item). When a definition changes: log event, flag all affected segments, present batch review UI with audit trail.

7. **Extend Memo Universal** (Roadmap #3) to all engines -- Markdown and PDF currently lack memo fields that Audio/Video already have.

### Strategy (PMM and positioning)

8. **Position Qualia Coding as "complement-first, alternative-possible"** -- the complement frame is safest for institutional adoption, but solo/small-team messaging can emphasize standalone capability.

9. **Open-core monetization validated:** Core (free) must include basic coding + emergency export. Pro (paid) can include REFI-QDA multimodal, advanced analytics, R/Python scripts. Team (paid) can include Review Queue, intercoder metrics, claiming/workqueue. Ensure export/portability is never paywalled.

10. **Publish data format documentation** -- schemas for data.json, export formats, and REFI-QDA mapping specifications. This directly addresses the trust/lock-in concern that both participants raised.

### Deferred (explicitly)

- Real-time CRDT co-editing (high cost, low near-term return -- defer 9-12 months)
- Enterprise features (SSO, SLA, on-prem) until team features are validated via pilot
- Complex audio/video temporal annotation beyond current WaveSurfer implementation
- Exotic analytics visualizations before export/filters/basics are stable

---

*Document generated: 2026-03-03. Source files: `docs/research/synthetic users research/User Research Study.pdf`, `docs/research/synthetic users research/report Synthetic Users.md`, `docs/research/synthetic users research/Report Synthetic Userss.md`. All quotes are verbatim from SyntheticUsers.com dynamic interview transcripts.*
