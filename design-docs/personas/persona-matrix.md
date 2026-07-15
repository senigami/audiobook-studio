# Persona Mechanics Matrix

A trait view of the roster: where each persona sits on the load-bearing axes. Use it to **compose a panel for a review or brainstorm that no pre-baked panel covers**, and to **check a panel for diversity** before you run it.

This complements the two task-oriented mappings — don't duplicate them:
- Known review task → [review-panels.md](review-panels.md) (ready-made panels).
- Known design area → [00-index.md](00-index.md) "How to Use in Review" (high-signal start per area).
- **Novel ask / diversity check → this matrix.**

Values are starting heuristics, not law — sharpen them as the personas are validated. Keyed by number so this table stays in sync with the [index roster](00-index.md) (which owns depth + "why load-bearing").

## Legend

- **Grp:** `C` Creative & Editorial · `T` Technical & Operator · `A` Accessibility & Edge · `D` Design & Craft
- **Stage:** where in the manuscript→audio→publish pipeline they live
- **Level:** `Novice` · `Interm` · `Power` · `Dev` (writes code) · `Specialist` (domain expert, non-dev)
- **Stance:** `User` (does the work) · `Operator` (runs/gates the work) · `Auditor` (reviews against a standard) · `Maintainer` (owns the contract/code/docs)
- **Scale:** `1 book` · `Multi` (several projects) · `Catalog` (hundreds+) · `—` (not project-bound)
- **Optimizes for:** their north star — pick *conflicting* ones for brainstorming tension

## Matrix

| # | Persona | Grp | Stage | Level | Stance | Scale | Optimizes for |
|---|---|---|---|---|---|---|---|
| 01 | Novel Adapter | C | Manuscript / authoring | Interm | User | 1 book | Authorial fidelity |
| 02 | Dialogue Playwright | C | Manuscript (script parse) | Interm | User | 1 book | Structure & attribution clarity |
| 03 | Series Editor | C | Edit / continuity | Interm | Auditor | Multi | Cross-chapter consistency |
| 04 | Copy Editor | C | Edit / review (text) | Interm | Auditor | 1 book | Spoken correctness |
| 05 | Narrator Performer | C | Cast / performance prep | Interm | User | 1 book | Performance clarity |
| 06 | Casting Director | C | Cast / voice | Power | Operator | Multi | Casting traceability |
| 07 | Audio Producer | C | Render → post | Power | Operator | Multi | Production control |
| 08 | Mastering Engineer | C | Post / master | Specialist | Auditor | 1 book | Audio technical quality |
| 09 | Publisher Ops | C | Publish / release | Interm | Operator | Multi | Release safety |
| 10 | Localization Lead | C | Localize | Power | Operator | Multi / locale | Locale fidelity |
| 11 | Sensitivity Reader | C | Edit / review (content) | Specialist | Auditor | 1 book | Representation risk |
| 12 | Rights Manager | C | Publish (rights gate) | Specialist | Operator | Multi | Rights boundary |
| 13 | Review-Only Proofreader | C | Edit / review (audio) | Interm | Auditor | 1 book | Non-destructive review |
| 42 | Voice-Clone Trainer | C | Cast / voice cloning | Power | User | — | Clone quality (train→test→refine) |
| 14 | API Integrator | T | Dev / extend (API) | Dev | Maintainer | — | Contract stability |
| 15 | Plugin Author | T | Dev / extend (plugin) | Dev | Maintainer | — | Plugin contract clarity |
| 16 | Power User | T | Render / queue | Power | User | Multi | Throughput & reliability |
| 17 | Local Sysadmin | T | Ops / recovery | Power | Operator | — | Restart safety |
| 18 | Cross-Platform Installer | T | First-run / install | Specialist | Auditor | — | Install reliability |
| 19 | Automation User | T | Dev / extend (automation) | Dev | Operator | Catalog | Idempotency |
| 20 | Engine Maintainer | T | Dev / extend (engine) | Dev | Maintainer | — | Contract & ETA stability |
| 21 | QA Engineer | T | Dev / extend (test) | Dev | Auditor | — | Reproducibility / regression |
| 22 | Privacy & Security Reviewer | T | Cross-cut (security) | Specialist | Auditor | — | Trust boundary |
| 23 | Queue Operator | T | Render / queue (ops) | Power | Operator | Multi | Live ownership & recovery |
| 24 | Observability Debugger | T | Render / queue (diag) | Dev | Maintainer | — | Event causality |
| 25 | Migration & Recovery Operator | T | Ops / recovery | Specialist | Operator | Catalog | Safe cutover |
| 26 | Release Doc Maintainer | T | Dev / extend (docs) | Specialist | Maintainer | — | Spec ↔ code alignment |
| 27 | Casual Listener | A | First-run | Novice | User | 1 book | Fast first success (one-shot) |
| 28 | Nontechnical Author ★ | A | First-run / authoring | Novice | User | 1 book | Plain-language success + recovery |
| 29 | Screen Reader Producer | A | Cross-cut (a11y) | Power | User (AT) | 1 book | Non-visual operability |
| 30 | Accessibility QA | A | Cross-cut (a11y) | Specialist | Auditor | — | WCAG conformance |
| 31 | Dyslexic Reader | A | Cross-cut (a11y) | Interm | User | 1 book | Readability / low noise |
| 32 | Motor-Impaired Keyboard User | A | Cross-cut (a11y) | Power | User | 1 book | Non-pointer paths |
| 33 | Deadline Editor | A | Render / queue | Power | User | 1 book | Perceived speed & trust |
| 34 | Teacher Builder | A | Catalog / batch | Interm | User | Batch | Repeatable consistency |
| 35 | Small Team Marketer | A | Publish / collaborate | Interm | Operator | Multi | Version safety & approval |
| 36 | Multilingual Author | A | Localize / authoring | Interm | User | 1 book (mixed-lang) | Language fidelity |
| 37 | Low-Spec Laptop User | A | Cross-cut (performance) | Interm | User | 1 book | Usability under constraint |
| 38 | Offline Privacy User | A | Cross-cut (privacy) | Interm | User | 1 book | Local-first guarantee |
| 39 | Plugin Tinkerer | A | Dev / extend (plugin use) | Power | User | — | Install / compare / recover |
| 40 | Support Triage Agent | A | Support | Interm | Operator | Multi | Diagnosability |
| 41 | Large Catalog Curator | A | Catalog / batch | Power | Operator | Catalog | Findability & safe bulk |
| 43 | Color-Blind / Low-Vision User | A | Cross-cut (a11y) | Interm | User | 1 book | Color-independent state |
| 44 | Apple HIG Purist | D | Cross-cut (design review) | Specialist | Auditor | — | Platform-native feel & restraint |
| 45 | Design-Systems Consistency Reviewer | D | Cross-cut (design review) | Specialist | Auditor | — | Token/component consistency |
| 46 | Motion & Interaction Designer | D | Cross-cut (design review) | Specialist | Auditor | — | Interaction feel & motion intent |

★ = primary persona.

## How to use the matrix

**1. Compose a panel for a novel ask.** Filter by the column that matches the surface:
- *Reviewing a new export-format screen?* Stage = Publish/Post → Publisher Ops (09), Rights Manager (12), Mastering Engineer (08), plus Audio Producer (07).
- *Reviewing the first-render flow?* Stage = First-run + Render → Casual Listener (27), Nontechnical Author (28), Deadline Editor (33), Power User (16).
- *Reviewing the voice-cloning UI?* Stage = Cast/voice cloning → Voice-Clone Trainer (42), then Casting Director (06) and Narrator Performer (05) downstream.
- *Reviewing visual polish, platform fit, or a new component's look?* Design & Craft → Apple HIG Purist (44), Design-Systems Consistency Reviewer (45), Motion & Interaction Designer (46).

**2. Check a panel for diversity before running it.** A good adversarial panel spans:
- **≥ 2 stances** — a `User` and an `Auditor`/`Maintainer` catch different classes of problem (lived friction vs. contract/standard violations).
- **≥ 2 levels** — pair a `Novice`/`Interm` with a `Power`/`Dev` so you catch both "I'm lost" and "this won't scale."
- **≥ 1 cross-cutting lens** — at least one a11y / privacy / performance / design-craft persona on any UI review (rows marked Stage = Cross-cut).

If your panel is all `User` + all `Power`, you'll miss the standards-and-scale failures; if it's all `Auditor` + `Dev`, you'll miss the "ordinary person can't find the button" failures.

**3. Brainstorm with deliberate tension.** Pick 3–4 personas whose **Optimizes for** values pull against each other and ask each what they'd demand of the feature. The friction between, say, the Nontechnical Author's *fast first success*, the Privacy & Security Reviewer's *trust boundary*, and the Large Catalog Curator's *safe bulk* is where the real design trade-offs live. Consensus panels produce bland features; conflicting north stars produce decisions.

**4. Spot your own coverage gaps.** If an ask doesn't map cleanly onto any row's Stage/Optimizes-for, that may be a missing persona — log it in the [validation backlog](00-index.md#validation-backlog).
