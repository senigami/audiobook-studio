# Persona Roster — Audiobook Studio 2.0

**Purpose:** Standing cast for design review, adversarial testing, and feature scoping. Use these as question-askers on any proposed screen, flow, or specification. They do not define requirements — they reveal friction.

---

## Confidence Ladder

All current personas are **INFERRED** — synthesized from product domain knowledge and user-type reasoning, not real interviews. Treat them as useful hypotheses, not ground truth.

| Badge | Meaning |
|---|---|
| **OBSERVED** | Validated through direct interviews, recordings, or support tickets |
| **PARTIALLY CORROBORATED** | No interview, but key behaviors confirmed by adjacent evidence |
| **INFERRED** | Synthesized from domain reasoning — zero direct evidence |

---

## Roster

Each persona is identified purely by role — no invented human name. The file slug and header title are the same role name throughout.

### Creative & Editorial

| # | Persona | Depth | Why they're load-bearing |
|---|---|---|---|
| [01](01-novel-adapter.md) | Novel Adapter | Full | Authorial intent, prose-to-audio drift, pacing annotation |
| [02](02-dialogue-playwright.md) | Dialogue Playwright | Mid | Attribution parsing, stage directions, mixed formatting |
| [03](03-series-editor.md) | Series Editor | Mid | Cross-chapter continuity, voice consistency, revision tracking |
| [04](04-copy-editor.md) | Copy Editor | Mid | Spoken awkwardness, punctuation-driven pauses, homophone traps |
| [05](05-narrator-performer.md) | Narrator Performer | Mid | Performance notes, pronunciation, pickup list management |
| [06](06-casting-director.md) | Casting Director | Full | Casting map, voice audition UX, assignment traceability |
| [07](07-audio-producer.md) | Audio Producer | Mid | Queue health, retake management, production handoff |
| [08](08-mastering-engineer.md) | Mastering Engineer | Mid | Loudness, clipping, export technical quality |
| [09](09-publisher-ops.md) | Publisher Ops | Mid | Release gating, publish safety, deliverable audit |
| [10](10-localization-lead.md) | Localization Lead | Mid | Multi-language, RTL, locale-specific fallback |
| [11](11-sensitivity-reader.md) | Sensitivity Reader | Mid | Content review, representation, performance risk |
| [12](12-rights-manager.md) | Rights Manager | Mid | Rights boundary, authorized export scope |
| [13](13-review-only-proofreader.md) | Review-Only Proofreader | Mid | Narrow, non-destructive annotation without workflow noise |
| [42](42-voice-clone-trainer.md) | Voice-Clone Trainer | Mid | The train→test→refine→retrain loop; clone versioning, sample quality |

### Technical & Operator

| # | Persona | Depth | Why they're load-bearing |
|---|---|---|---|
| [14](14-api-integrator.md) | API Integrator | Mid | Contract validation, error mapping, WebSocket frame ordering |
| [15](15-plugin-author.md) | Plugin Author | Mid | Engine contract, manifest compliance, dev/runtime alignment |
| [16](16-power-user.md) | Power User | Full | Scale stress test, queue reliability, session persistence under load |
| [17](17-local-sysadmin.md) | Local Sysadmin | Mid | Port management, dependency recovery, restart safety |
| [18](18-cross-platform-installer.md) | Cross-Platform Installer | Mid | Platform-specific install edge cases, path spaces, GPU drivers |
| [19](19-automation-user.md) | Automation User | Mid | Idempotent batch automation, programmatic job status |
| [20](20-engine-maintainer.md) | Engine Maintainer | Mid | TTS contract stability, ETA semantics, marker timing |
| [21](21-qa-engineer.md) | QA Engineer | Mid | Reproducible failure paths, regression surface, state resets |
| [22](22-privacy-security-reviewer.md) | Privacy & Security Reviewer | Mid | Local-first trust, plugin sandboxing, path traversal |
| [23](23-queue-operator.md) | Queue Operator | Mid | Live queue triage, stuck job recovery, ownership visibility |
| [24](24-observability-debugger.md) | Observability Debugger | Mid | Event trace, frame causality, log noise reduction |
| [25](25-migration-recovery-operator.md) | Migration & Recovery Operator | Mid | State cutover, artifact stale detection, legacy path handling |
| [26](26-release-doc-maintainer.md) | Release Doc Maintainer | Mid | Spec/code alignment, changelog completeness |

### Accessibility & Edge Cases

| # | Persona | Depth | Why they're load-bearing |
|---|---|---|---|
| [27](27-casual-listener.md) | Casual Listener | Mid | Fast first success, minimal cognitive load, zero plugin knowledge |
| [28](28-nontechnical-author.md) | Nontechnical Author | Full | **Primary persona** — plain language, default trust, recovery UX |
| [29](29-screen-reader-producer.md) | Screen Reader Producer | Mid | Keyboard-only, semantic structure, non-visual state feedback |
| [30](30-accessibility-qa.md) | Accessibility QA | Mid | Focus order, modal behavior, non-color status indicators |
| [31](31-dyslexic-reader.md) | Dyslexic Reader | Mid | Typography, visual hierarchy, reduced noise |
| [32](32-motor-impaired-keyboard-user.md) | Motor-Impaired Keyboard User | Mid | No drag, no hover, forgiving keyboard paths |
| [33](33-deadline-editor.md) | Deadline Editor | Mid | Perceived speed, latency transparency, completion clarity |
| [34](34-teacher-builder.md) | Teacher Builder | Mid | Batch production, consistent voices, classroom-appropriate export |
| [35](35-small-team-marketer.md) | Small Team Marketer | Mid | Collaboration clarity, version safety, publish confidence |
| [36](36-multilingual-author.md) | Multilingual Author | Mid | Mixed-language chapters, locale fallback, pronunciation |
| [37](37-low-spec-laptop-user.md) | Low-Spec Laptop User | Mid | UI under CPU/RAM/storage constraints |
| [38](38-offline-privacy-user.md) | Offline Privacy User | Mid | Local-first promise, plugin trust, cloud assumption visibility |
| [39](39-plugin-tinkerer.md) | Plugin Tinkerer | Mid | Fast try/compare/recover plugin install cycles |
| [40](40-support-triage-agent.md) | Support Triage Agent | Mid | Diagnostics, debug state export, error attribution |
| [41](41-large-catalog-curator.md) | Large Catalog Curator | Mid | List scale, search/filter/sort, safe bulk operations |
| [43](43-color-blind-user.md) | Color-Blind / Low-Vision User | Mid | State signaled by color alone; status orbs, swatches, banner contrast |

### Design & Craft

Not product-usage personas — these are professional design-reviewer personas, seated on a panel to critique the app's own visual/interaction design rather than to report friction from using it. Use them whenever a fusion or adversarial-review panel needs a strong, opinionated design voice (a new screen, a component redesign, a visual-polish pass).

| # | Persona | Depth | Why they're load-bearing |
|---|---|---|---|
| [44](44-apple-hig-purist.md) | Apple HIG Purist | Full | Platform-native feel, restraint, Apple Human Interface Guidelines conformance |
| [45](45-design-systems-consistency-reviewer.md) | Design-Systems Consistency Reviewer | Mid | Token/spacing/color drift, component reuse vs. reinvention |
| [46](46-motion-interaction-designer.md) | Motion & Interaction Designer | Mid | Animation intent, transition feel, micro-interaction polish |

---

## How to Use in Review

Ask: **"What would the [Role Name] want to know about this screen, and what would make them close the tab?"**

For ready-made multi-persona panels covering **every** persona (first-run, chapter editor, casting, queue, plugins, accessibility, publish, support), see [review-panels.md](review-panels.md). To compose a panel for a *novel* ask, or to check a panel for stance/level diversity, use the [persona-matrix.md](persona-matrix.md) trait view. The table below is just the highest-signal starting point per area — not the full mapping.

**High-signal pairings by design area:**

| Area | Use first | Also check |
|---|---|---|
| First-run / onboarding | Nontechnical Author (28), Casual Listener (27) | Novel Adapter (01) |
| Voice assignment / casting | Casting Director (06), Novel Adapter (01) | Power User (16) |
| Voice cloning / training | Voice-Clone Trainer (42) | Casting Director (06) |
| Chapter editor — Voices mode | Casting Director (06), Novel Adapter (01) | Nontechnical Author (28) |
| Performance annotation / delivery | Narrator Performer (05), Novel Adapter (01) | Casting Director (06) |
| Queue and progress | Power User (16), Queue Operator (23) | Audio Producer (07) |
| Plugin install / management | Plugin Tinkerer (39), Plugin Author (15) | Privacy & Security Reviewer (22) |
| Accessibility | Motor-Impaired Keyboard User (32), Screen Reader Producer (29) | Accessibility QA (30), Dyslexic Reader (31), Color-Blind / Low-Vision User (43) |
| Export / publish | Publisher Ops (09), Rights Manager (12) | Audio Producer (07) |
| Error recovery | Nontechnical Author (28), Power User (16) | Support Triage Agent (40) |
| Large-scale / performance | Power User (16), Large Catalog Curator (41) | Low-Spec Laptop User (37) |
| Visual polish / platform fit / new component | Apple HIG Purist (44), Design-Systems Consistency Reviewer (45) | Motion & Interaction Designer (46) |

---

## Validation Backlog

**Feedback loop:** personas are hypotheses, so real sessions are evidence. When a review, triage, or user report confirms or contradicts a persona's friction point, note it in that persona's file (a dated line under the relevant F# or red flag) — and upgrade the badge (INFERRED → PARTIALLY CORROBORATED) when adjacent evidence accumulates. A persona repeatedly contradicted by real usage should be revised or retired, not kept out of completeness.

In rough priority order — interview these real-world types to corroborate or challenge each persona:

1. **Nontechnical Author (28)** — first-time self-published authors using any AI audiobook tool. Forum: r/selfpublishing, Reedsy community, ACX newcomers. Key question: where do first-timers abandon the workflow, and what language breaks down first?
2. **Casting Director (06)** — professional audiobook casting directors or voice directors at publishers. Key question: how is a casting decision documented, communicated, and revised in practice?
3. **Power User (16)** — high-volume freelance audiobook producers (ACX, Findaway). Key question: what are the most common failure modes in a 200-segment job, and what's the recovery flow?
4. **Novel Adapter (01)** — literary fiction authors who've done their own audiobook adaptation. Key question: how do authors think about delivery intent at segment level — what language do they use?
5. **Narrator Performer (05)** — professional narrators who work from producer-provided scripts. Key question: what information does a narrator need on a script card to deliver intent rather than just words?
6. **Apple HIG Purist (44)** — professional iOS/macOS designers or Apple HIG-trained reviewers. Key question: does this app's actual departure-from-native-conventions bother real Apple-ecosystem users, or only a purist reviewer?
