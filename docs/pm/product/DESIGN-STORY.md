# Qualia Coding — Design Story

> A case study of how mixed analysis theory, visual design references, and a technical breakthrough converged into a cross-media QDA tool inside Obsidian.

---

## 1. The Vision

I wanted MAXQDA-level qualitative coding inside Obsidian. Not a toy highlighter, not a tag manager — real segment selection, margin panel with color-coded stripes, column allocation that avoids label collisions, a proper coding menu with suggestions and progressive disclosure. The kind of interaction I had used as a researcher working with MAXQDA and later observed in Dovetail's popover-based workflow.

The gap was clear from both sides. Professional QDA tools — MAXQDA, NVivo, Atlas.ti — are powerful but operate as isolated databases. Your data goes in, your analysis stays locked in a proprietary format, and your workflow is severed from everything else you do. On the other side, Obsidian plugins for annotation were single-format (text only), and most of them worked by injecting HTML spans or custom syntax directly into markdown files. That meant your notes got dirty — the analysis became entangled with the content, breaking portability and violating the principle that research data should remain untouched by the tool that analyzes it.

The ambition was specific: professional-quality qualitative coding across multiple media types (text, PDF, CSV, images, audio, video), with the analysis stored separately from the source files, running entirely inside Obsidian where the researcher already lives. No cloud dependency, no lock-in, no compromised markdown.

What I did not anticipate was where this ambition would lead — into mixed analysis theory, a 60-source literature review, and an analytics engine implementing techniques that most QDA tools do not even attempt.

---

## 2. Three Converging Trails

The plugin's design emerged from three independent lines of exploration that converged over months. Each one unlocked something the others could not provide alone.

### 2.1 Visual References Trail

My references were not academic — they were lived experience as a user and as a designer evaluating interaction patterns.

From MAXQDA, I carried the margin panel model: colored stripes in a dedicated column beside the text, with an allocation algorithm that prevents visual overlap when multiple codes share the same region. The margin panel is the defining interaction of professional QDA — it makes the density of coding visible at a glance without modifying the document. Label placement, collision avoidance, column assignment — these are layout problems that MAXQDA solved decades ago, and I wanted the same quality inside a code editor.

From Dovetail, I carried the popover menu pattern: select text, a context menu appears with code suggestions, recently used codes at the top, search for existing codes or create new ones. Two-mode logic (apply existing vs. create new) with progressive disclosure. This interaction makes coding fast without sacrificing discoverability.

Neither reference came from a competitive analysis exercise. I had used both tools in real research work and knew what mattered in the interaction: speed of coding, visual density feedback, and a path from selection to code that requires minimal cognitive load.

### 2.2 Technical Trail

The first prototype used HTML `<span>` tags to wrap coded segments directly in the markdown file. It worked, but it contaminated the note — exactly the problem I wanted to avoid. The moment I saw annotated markdown rendered with broken formatting in another tool, the approach was dead.

The pivot went in two directions. First, the coding menu became a popover triggered by text selection, storing markers in a sidecar data structure rather than in the document. Second — and this was the real breakthrough — I discovered CodeMirror 6's decoration API while working with Cursor. CM6 allows you to overlay visual elements (highlights, widgets, gutters) on top of the editor content without modifying the underlying document. Decorations are a view-layer concern; the markdown file never changes.

This was the technical gate. The proof that "notes stay clean" was not just a design aspiration but an implementable architecture unlocked everything that followed. Once I knew the source files would remain untouched, the ambition shifted from "annotate text" to "build a professional QDA tool" — because the fundamental integrity constraint was solved.

### 2.3 Theoretical Trail

The theoretical trail started with a product design question, not an academic one. When building the action menu for codes (what can a researcher *do* with codes beyond visualizing them?), I needed to understand which analytical methods use qualitative coding as input for deeper analysis.

That question triggered a deep research process — roughly 60 sources across epistemology, techniques, quality frameworks, and technology, using multiple AI tools as research assistants to find, cross-reference, and synthesize literature. The pivotal discovery was the *Routledge Reviewer's Guide to Mixed Methods Analysis* (Onwuegbuzie & Johnson, 2021), which formalized a field I had been practicing without knowing its name.

The recognition was immediate: crossover mixed analysis — applying quantitative techniques to qualitative data — was exactly what I had done at Sicredi years earlier (running MCA on coded insights to generate "Experience Territories") and what the action menu needed to enable. The literature gave names, frameworks, and 60 years of epistemological debate to practices that already existed in my work.

The research consolidated into Foundations.md (~60 sources, ~3,100 lines), a personal reference document covering the full landscape of data transformation between qualitative and quantitative traditions. Its impact on the plugin was decisive: the scope exploded from a text marker to a cross-media QDA tool with 19 analytical ViewModes, covering descriptive, inferential, measurement, and exploratory analysis — all grounded in the mixed analysis literature.

---

## 3. Data Transformation as the Heart of Design

The conceptual framework behind Qualia Coding's analytics is mixed analysis — not mixed methods. The distinction matters. Mixed methods refers to research designs that combine qualitative and quantitative data collection. Mixed analysis refers specifically to the analytical techniques that operate across the qualitative-quantitative boundary (Onwuegbuzie & Combs, 2010). A researcher can perform mixed analysis on purely qualitative data, which is precisely what Qualia Coding enables: the input is coded qualitative material, and the analytical engine transforms it through techniques borrowed from both traditions.

### The Conceptual Foundations

Four ideas from the literature shaped the analytics design directly:

**Crossover mixed analysis** (Onwuegbuzie & Combs, 2010) — the application of analytical techniques from one research tradition to data from another. This concept legitimizes the core operation of Qualia Coding: taking qualitative coded data and running quantitative techniques (MCA, chi-square, clustering) on it. The crossover is not a violation of epistemological boundaries; it is a recognized analytical strategy with decades of theoretical grounding.

**The quantitization-qualitization continuum** (Sandelowski, Voils & Knafl, 2009) — the insight that no clear line separates qualitative from quantitative data, that they "imply one another." This continuum informed the decision to always provide a path back to the original qualitative data. Every visualization in Qualia Coding is a transformation along this continuum, not a replacement of the source material.

**The formula 1+1=1** (Onwuegbuzie, 2017) — representing complete integration where qualitative and quantitative elements are "maximally interactive from the beginning of the research process" (Onwuegbuzie et al., 2018, p. 667). This anti-dualistic posture means the tool should not segregate "qualitative views" from "quantitative views" — they coexist in the same analytical space, accessible through the same interface, operating on the same coded data.

**Meta-inferences as "cinematic montage"** (Denzin & Lincoln, 2000, via Rodrigues, 2007) — the idea that the researcher is a *bricoleur* who assembles meaning from heterogeneous elements, creating "an emergent construction that changes and takes new forms whenever different instruments, methods, and techniques of representation are added to the puzzle" ("uma construcao emergente, que muda, e toma novas formas, sempre que diferentes instrumentos, metodos e tecnicas de representacao sao adicionados ao puzzle," Rodrigues, 2007, p. 110). This directly inspired the Research Board — a free canvas where the researcher drags snapshots from any visualization, KPI cards, code excerpts, and annotations to construct their own interpretive montage.

### The DIME Mapping

Onwuegbuzie's DIME model (Descriptive, Inferential, Measurement, Exploratory) provided the organizational framework for the analytics engine. Each ViewMode maps to a level of analytical depth:

| DIME Level | Representative ViewModes | Concept |
|---|---|---|
| Descriptive | frequency, word-cloud, text-stats | Basic quantitization — counting, frequency, lexical richness |
| Inferential | chi-square, lag-sequential | Tests of independence and sequentiality |
| Measurement | MCA, MDS | Crossover analysis — quantitative techniques on qualitative data |
| Exploratory | dendrogram, decision-tree, polar-coords | Multivariate classification |

> The full mapping of all 19 ViewModes to DIME levels and their theoretical grounding is documented in the ecosystem reference (`ecossistema-qualia-historia-e-cases.md`). This table highlights representative modes to illustrate the structural relationship.

### Derived Design Principles

From this theoretical framework, four principles emerged that govern every analytical feature:

1. **"Qualia processes, the researcher interprets."** The tool computes frequencies, matrices, projections, and clusters. It never tells the researcher what the results *mean*. This follows the meta-aggregation principle: faithfulness to the original findings without reinterpretation by the tool (Lockwood, 2020).

2. **Text retrieval alongside visualizations.** Every quantitative view maintains a path back to the qualitative source. The text-retrieval mode groups original coded excerpts by code or by file, ensuring the researcher can always return from the abstraction to the data. The continuum runs both ways.

3. **Quality metrics visible.** Kruskal stress-1 in MDS, explained inertia in MCA, p-values in chi-square, silhouette scores in clustering — these are not hidden in a technical appendix. They appear in the interface because the researcher needs to evaluate methodological adequacy, not just see a chart.

4. **Research Board as joint display.** The free canvas where the researcher composes their interpretive narrative from heterogeneous analytical artifacts materializes the joint display concept discussed across the mixed methods literature — the space where quantitative and qualitative findings are presented together for integrated interpretation.

---

## 4. MCA as the Common Thread

If there is a single technique that traces the entire trajectory from intuition to implementation to theoretical grounding, it is Multiple Correspondence Analysis.

The first time I used MCA was for my MBA thesis at ESPM (Escola Superior de Propaganda e Marketing), in the Market Research and Consumer Insights program. The goal was to build design personas from survey data — plotting respondent profiles on a two-dimensional biplot where proximity meant similarity across multiple categorical variables. It was an academic exercise, but the technique stuck: MCA could reveal structure in categorical data that cross-tabulations could not.

Years later, at Sicredi (via Meiuca, a design consultancy), I faced a different problem: a repository of insights from past research studies, classified in an Excel spreadsheet. There was no budget for new research. The solution was to run MCA in R on the coded insights to discover which problems and experiences systematically co-occurred. The output was not a statistical table — it was a qualitative concept derived from the quantitative projection: **"Territorios de Experiencia"** (Experience Territories), interpretive spaces where recurring problems coexisted. The complete crossover cycle: qualitative (coded insights) to quantitative (MCA in R) to qualitative again (named, interpreted territories).

The third appearance was in DeepVoC, a framework for analyzing NPS feedback at scale. Notebook 30 ran MCA on customer segmentation data from ~23,000 feedbacks across six surveys. Here, MCA operated inside an automated pipeline — BERTopic discovered themes, Claude analyzed them qualitatively, and MCA projected the segmentation structure. The same technique, now at production scale with LLMs in the loop.

The fourth appearance is qualia-coding itself. MCA is implemented from scratch in TypeScript (`mcaEngine.ts`), using SVD decomposition (via svd-js) to project the indicator matrix onto a 2D biplot — entirely client-side, no R, no Python, no backend. The researcher codes qualitative data in Obsidian, and the same technique that once required a statistical programming environment now runs in the browser.

The fifth appearance is theoretical. In Foundations.md, thread `#ac` traces the epistemological legitimacy of Correspondence Analysis as a crossover technique, grounded in Dickinson (2021) and connected to the broader framework of crossover mixed analysis.

Five contexts, three programming languages (R, Python, TypeScript), four domains (design, consultancy, NPS analytics, qualitative coding), one technique. The cycle is always the same: qualitative data in, quantitative projection, qualitative interpretation out. What changed over the years was the grounding — from experimental use without theoretical awareness to deliberate application backed by a 60-source literature review. The Routledge handbook did not teach me MCA. It taught me *why* MCA was epistemologically legitimate for the work I had already been doing.

---

## 5. Design Decisions That Carry Epistemology

Not every design decision in Qualia Coding is a UX preference. Several carry epistemological weight — they encode positions about how qualitative data should be treated, who holds interpretive authority, and what transparency means in a research tool.

| Design Decision | Epistemological Grounding |
|---|---|
| Source type filter in analytics | Cross-media triangulation as a first-class interaction. The researcher can compare how the same code manifests across text, PDF, audio, video, and image — operationalizing triangulation without a separate step |
| Text retrieval alongside every visualization | The path back to qualitative data is always present. No quantitative view exists without a way to return to the original coded excerpt. The continuum runs both ways |
| Research Board as free canvas | "The researcher interprets, not the tool." The board provides no automated synthesis — it provides space for the researcher to construct their own interpretive montage from heterogeneous analytical artifacts |
| Consistent code colors across all views | Cognitive continuity. A code that is blue in the margin panel is blue in the co-occurrence matrix, blue in the MCA biplot, blue in the word cloud. The researcher tracks meaning across representations without re-learning the visual mapping |
| Obsidian as platform | Analysis within the researcher's existing workflow. Local-first, no cloud dependency, no account creation. The vault is a vault of notes, not a database ("O vault e um vault de notas, nao um banco de dados," ARCHITECTURE.md §1) |
| Client-side without backend | A product decision with epistemological consequences: the researcher's data never leaves their machine. Privacy is not a feature toggle — it is an architectural constraint |
| Quality metrics exposed | Kruskal stress-1, explained inertia, p-values, silhouette scores appear in the interface. Hiding them would make the tool a black box; showing them honors the researcher's responsibility to evaluate methodological adequacy |
| No automated interpretation | The tool amplifies analytical capacity, it does not replace interpretive judgment. As Dey (1993, cited by Rodrigues, 2007) observed about earlier CAQDAS tools: "problems arise when the analyst is mechanical, not the computer" |

### What Was Deliberately Not Built

Decisions *not* to build something carry as much design intent as decisions to build:

- **No backend for analytics.** Every statistical computation runs client-side in TypeScript. No R, no Python, no server. This constrains the statistical repertoire but guarantees zero external dependencies and complete data sovereignty.
- **No D3.js for visualizations.** Bundle size matters inside Obsidian. Chart.js and hand-rolled SVG cover every ViewMode without the weight of a general-purpose visualization library.
- **No hidden quality metrics.** The researcher needs to know when an MCA explains only 15% of inertia or when a chi-square p-value is 0.73. Suppressing these would be epistemologically dishonest.
- **No automated coding.** The tool does not suggest codes, auto-tag segments, or run classifiers. Qualitative coding is an interpretive act — automating it would undermine the researcher's analytical agency. As Saldana (2020) demonstrates, the same data coded as "DISTRESSING" by one researcher and "DECREASING CURVE" by another is not error — it is the nature of qualitative inquiry.

---

## 6. The Ecosystem

Qualia Coding does not exist in isolation. It is one component of a broader ecosystem built around the same premise: that the researcher's work is fundamentally about transforming data between qualitative and quantitative representations, and that tools should make these transformations explicit, configurable, and traceable.

**Qualia Core** (Python, FastAPI) is an agnostic analysis engine — a REST API that receives text, audio, or video and returns JSON. It knows nothing about the meaning of the data; interpretation is the consumer's responsibility. Eight plugins cover word frequency, sentiment, readability, transcription, and visualization. The core discovers plugins automatically; adding one is creating a folder, removing one is deleting it.

**qualia-coding** (TypeScript, Obsidian) is the researcher's interface — the plugin described in this document. It consumes qualitative data across six media formats and provides 19 analytical ViewModes plus the Research Board. All statistical computation runs client-side.

**Foundations.md** (~60 sources, ~3,100 lines) is the theoretical grounding — a personal synthesis of the mixed analysis literature that informed both the analytics engine and the ecosystem's design philosophy.

The full ecosystem history, including the transcript-analyser prototype, the DeepVoC NPS framework, and the WhatsApp analytics pipeline, is documented in `ecossistema-qualia-historia-e-cases.md`.

---

## 7. References and Influences

### Theoretical

- **Onwuegbuzie, A. J. & Johnson, R. B. (Eds.)** (2021). *The Routledge Reviewer's Guide to Mixed Methods Analysis.* The first book devoted solely to mixed methods analyses. Primary source for the DIME framework and crossover mixed analysis concepts.
- **Onwuegbuzie, A. J.** (2017). The formula 1+1=1 representing complete qualitative-quantitative integration.
- **Onwuegbuzie, A. J. & Combs, J. P.** (2010). Crossover mixed analysis — applying analytical techniques from one tradition to data from another.
- **Sandelowski, M., Voils, C. I. & Knafl, G.** (2009). On quantitizing. The interdependence of qualitative and quantitative data.
- **Sandelowski, M.** (2000). Combining qualitative and quantitative sampling, data collection, and analysis techniques in mixed-method studies.
- **Rodrigues, P.** (2007). The methodological bricoleur. Brazilian author whose work on mixed methods reflexivity and the Levi-Strauss bricoleur metaphor informed the Research Board concept.
- **Dickinson, P.** (2021). Correspondence Analysis as crossover technique in mixed methods.
- **Saldana, J.** (2020). Affective coding, the interpretive nature of qualitative coding, and Excel as an unexpected integration tool.
- **Denzin, N. K. & Lincoln, Y. S.** (2000). Meta-inferences as cinematic montage. The qualitative researcher as bricoleur.

### Design

- **MAXQDA** — Margin panel with column allocation and label collision avoidance. Segment selection model. The visual benchmark for professional QDA interaction.
- **Dovetail** — Popover-based coding menu with two-mode logic (apply existing code vs. create new), progressive disclosure, and suggestion ranking.

### Technology

- **CodeMirror 6** — The decoration API that made "notes stay clean" technically feasible. Highlights, widgets, and gutters as view-layer concerns, decoupled from document content.
- **Cursor** — The tool that implemented the first working CM6 prototype, proving the architectural concept.

---

For the detailed code evidence behind these design decisions, see [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md).
