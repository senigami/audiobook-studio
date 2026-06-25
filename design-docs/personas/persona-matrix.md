# Persona Mechanics Matrix

A trait view of the roster: where each persona sits on the load-bearing axes. Use it to **compose a panel for a review or brainstorm that no pre-baked panel covers**, and to **check a panel for diversity** before you run it.

This complements the two task-oriented mappings — don't duplicate them:
- Known review task → [review-panels.md](review-panels.md) (ready-made panels).
- Known design area → [00-index.md](00-index.md) "How to Use in Review" (high-signal start per area).
- **Novel ask / diversity check → this matrix.**

Values are starting heuristics, not law — sharpen them as the personas are validated. Keyed by number + name so this table stays in sync with the [index roster](00-index.md) (which owns depth + "why load-bearing").

## Legend

- **Grp:** `C` Creative & Editorial · `T` Technical & Operator · `A` Accessibility & Edge
- **Stage:** where in the manuscript→audio→publish pipeline they live
- **Level:** `Novice` · `Interm` · `Power` · `Dev` (writes code) · `Specialist` (domain expert, non-dev)
- **Stance:** `User` (does the work) · `Operator` (runs/gates the work) · `Auditor` (reviews against a standard) · `Maintainer` (owns the contract/code/docs)
- **Scale:** `1 book` · `Multi` (several projects) · `Catalog` (hundreds+) · `—` (not project-bound)
- **Optimizes for:** their north star — pick *conflicting* ones for brainstorming tension

## Matrix

| # | Persona | Grp | Stage | Level | Stance | Scale | Optimizes for |
|---|---|---|---|---|---|---|---|
| 01 | Morgan Chen · Novel Adapter | C | Manuscript / authoring | Interm | User | 1 book | Authorial fidelity |
| 02 | David Park · Dialogue Playwright | C | Manuscript (script parse) | Interm | User | 1 book | Structure & attribution clarity |
| 03 | Claire Whitmore · Series Editor | C | Edit / continuity | Interm | Auditor | Multi | Cross-chapter consistency |
| 04 | Priya Nair · Copy Editor | C | Edit / review (text) | Interm | Auditor | 1 book | Spoken correctness |
| 05 | Jimmy Calloway · Narrator Performer | C | Cast / performance prep | Interm | User | 1 book | Performance clarity |
| 06 | Alex Reyes · Casting Director | C | Cast / voice | Power | Operator | Multi | Casting traceability |
| 07 | Marta Sokolowski · Audio Producer | C | Render → post | Power | Operator | Multi | Production control |
| 08 | Derek Cho · Mastering Engineer | C | Post / master | Specialist | Auditor | 1 book | Audio technical quality |
| 09 | Sandra Liu · Publisher Ops | C | Publish / release | Interm | Operator | Multi | Release safety |
| 10 | Isabel Costa · Localization Lead | C | Localize | Power | Operator | Multi / locale | Locale fidelity |
| 11 | Zara Ahmed · Sensitivity Reader | C | Edit / review (content) | Specialist | Auditor | 1 book | Representation risk |
| 12 | Helen Novak · Rights Manager | C | Publish (rights gate) | Specialist | Operator | Multi | Rights boundary |
| 13 | Tom Fletcher · Review-Only Proofreader | C | Edit / review (audio) | Interm | Auditor | 1 book | Non-destructive review |
| 42 | Grace Okafor · Voice-Clone Trainer | C | Cast / voice cloning | Power | User | — | Clone quality (train→test→refine) |
| 14 | Kenji Watanabe · API Integrator | T | Dev / extend (API) | Dev | Maintainer | — | Contract stability |
| 15 | Sam Torres · Plugin Author | T | Dev / extend (plugin) | Dev | Maintainer | — | Plugin contract clarity |
| 16 | Jake Morrison · Power User | T | Render / queue | Power | User | Multi | Throughput & reliability |
| 17 | Brendan Walsh · Local Sysadmin | T | Ops / recovery | Power | Operator | — | Restart safety |
| 18 | Yuki Tanaka · Cross-Platform Installer | T | First-run / install | Specialist | Auditor | — | Install reliability |
| 19 | Ryan Chen · Automation User | T | Dev / extend (automation) | Dev | Operator | Catalog | Idempotency |
| 20 | Sarah Kim · Engine Maintainer | T | Dev / extend (engine) | Dev | Maintainer | — | Contract & ETA stability |
| 21 | Marcus Webb · QA Engineer | T | Dev / extend (test) | Dev | Auditor | — | Reproducibility / regression |
| 22 | Fatima Al-Rashid · Privacy & Security Reviewer | T | Cross-cut (security) | Specialist | Auditor | — | Trust boundary |
| 23 | Carlos Rivera · Queue Operator | T | Render / queue (ops) | Power | Operator | Multi | Live ownership & recovery |
| 24 | Aiko Yamamoto · Observability Debugger | T | Render / queue (diag) | Dev | Maintainer | — | Event causality |
| 25 | Phil Garrett · Migration & Recovery Operator | T | Ops / recovery | Specialist | Operator | Catalog | Safe cutover |
| 26 | Nadia Fischer · Release Doc Maintainer | T | Dev / extend (docs) | Specialist | Maintainer | — | Spec ↔ code alignment |
| 27 | Emma Patterson · Casual Listener | A | First-run | Novice | User | 1 book | Fast first success (one-shot) |
| 28 | Rosa Mendoza · Nontechnical Author ★ | A | First-run / authoring | Novice | User | 1 book | Plain-language success + recovery |
| 29 | Michael Osei · Screen Reader Producer | A | Cross-cut (a11y) | Power | User (AT) | 1 book | Non-visual operability |
| 30 | Lily Chen · Accessibility QA | A | Cross-cut (a11y) | Specialist | Auditor | — | WCAG conformance |
| 31 | Connor Brady · Dyslexic Reader | A | Cross-cut (a11y) | Interm | User | 1 book | Readability / low noise |
| 32 | Diane Morales · Motor-Impaired Keyboard User | A | Cross-cut (a11y) | Power | User | 1 book | Non-pointer paths |
| 33 | Oliver Grant · Deadline Editor | A | Render / queue | Power | User | 1 book | Perceived speed & trust |
| 34 | Maya Robinson · Teacher Builder | A | Catalog / batch | Interm | User | Batch | Repeatable consistency |
| 35 | Ben Nakamura · Small Team Marketer | A | Publish / collaborate | Interm | Operator | Multi | Version safety & approval |
| 36 | Sofia Andrade · Multilingual Author | A | Localize / authoring | Interm | User | 1 book (mixed-lang) | Language fidelity |
| 37 | Liam O'Brien · Low-Spec Laptop User | A | Cross-cut (performance) | Interm | User | 1 book | Usability under constraint |
| 38 | Nathan Holt · Offline Privacy User | A | Cross-cut (privacy) | Interm | User | 1 book | Local-first guarantee |
| 39 | Victor Zhang · Plugin Tinkerer | A | Dev / extend (plugin use) | Power | User | — | Install / compare / recover |
| 40 | Jenny Park · Support Triage Agent | A | Support | Interm | Operator | Multi | Diagnosability |
| 41 | Harriet Brooks · Large Catalog Curator | A | Catalog / batch | Power | Operator | Catalog | Findability & safe bulk |
| 43 | Marcus Liang · Color-Blind / Low-Vision User | A | Cross-cut (a11y) | Interm | User | 1 book | Color-independent state |

★ = primary persona.

## How to use the matrix

**1. Compose a panel for a novel ask.** Filter by the column that matches the surface:
- *Reviewing a new export-format screen?* Stage = Publish/Post → Sandra (09), Helen (12), Derek (08), plus Marta (07).
- *Reviewing the first-render flow?* Stage = First-run + Render → Emma (27), Rosa (28), Oliver (33), Jake (16).
- *Reviewing the voice-cloning UI?* Stage = Cast/voice cloning → Grace (42), then Alex (06) and Jimmy (05) downstream.

**2. Check a panel for diversity before running it.** A good adversarial panel spans:
- **≥ 2 stances** — a `User` and an `Auditor`/`Maintainer` catch different classes of problem (lived friction vs. contract/standard violations).
- **≥ 2 levels** — pair a `Novice`/`Interm` with a `Power`/`Dev` so you catch both "I'm lost" and "this won't scale."
- **≥ 1 cross-cutting lens** — at least one a11y / privacy / performance persona on any UI review (rows marked Stage = Cross-cut).

If your panel is all `User` + all `Power`, you'll miss the standards-and-scale failures; if it's all `Auditor` + `Dev`, you'll miss the "ordinary person can't find the button" failures.

**3. Brainstorm with deliberate tension.** Pick 3–4 personas whose **Optimizes for** values pull against each other and ask each what they'd demand of the feature. The friction between, say, Rosa's *fast first success*, Fatima's *trust boundary*, and Harriet's *safe bulk* is where the real design trade-offs live. Consensus panels produce bland features; conflicting north stars produce decisions.

**4. Spot your own coverage gaps.** If an ask doesn't map cleanly onto any row's Stage/Optimizes-for, that may be a missing persona — log it in the [validation backlog](00-index.md#validation-backlog).
