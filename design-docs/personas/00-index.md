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

### Creative & Editorial

| # | Persona | Name | Depth | Why they're load-bearing |
|---|---|---|---|---|
| [01](01-novel-adapter.md) | Novel Adapter | Morgan Chen | Full | Authorial intent, prose-to-audio drift, pacing annotation |
| [02](02-dialogue-playwright.md) | Dialogue Playwright | David Park | Mid | Attribution parsing, stage directions, mixed formatting |
| [03](03-series-editor.md) | Series Editor | Claire Whitmore | Mid | Cross-chapter continuity, voice consistency, revision tracking |
| [04](04-copy-editor.md) | Copy Editor | Priya Nair | Mid | Spoken awkwardness, punctuation-driven pauses, homophone traps |
| [05](05-narrator-performer.md) | Narrator Performer | Jimmy Calloway | Mid | Performance notes, pronunciation, pickup list management |
| [06](06-casting-director.md) | Casting Director | Alex Reyes | Full | Casting map, voice audition UX, assignment traceability |
| [07](07-audio-producer.md) | Audio Producer | Marta Sokolowski | Mid | Queue health, retake management, production handoff |
| [08](08-mastering-engineer.md) | Mastering Engineer | Derek Cho | Mid | Loudness, clipping, export technical quality |
| [09](09-publisher-ops.md) | Publisher Ops | Sandra Liu | Mid | Release gating, publish safety, deliverable audit |
| [10](10-localization-lead.md) | Localization Lead | Isabel Costa | Mid | Multi-language, RTL, locale-specific fallback |
| [11](11-sensitivity-reader.md) | Sensitivity Reader | Zara Ahmed | Mid | Content review, representation, performance risk |
| [12](12-rights-manager.md) | Rights Manager | Helen Novak | Mid | Rights boundary, authorized export scope |
| [13](13-review-only-proofreader.md) | Review-Only Proofreader | Tom Fletcher | Mid | Narrow, non-destructive annotation without workflow noise |
| [42](42-voice-clone-trainer.md) | Voice-Clone Trainer | Grace Okafor | Mid | The train→test→refine→retrain loop; clone versioning, sample quality |

### Technical & Operator

| # | Persona | Name | Depth | Why they're load-bearing |
|---|---|---|---|---|
| [14](14-api-integrator.md) | API Integrator | Kenji Watanabe | Mid | Contract validation, error mapping, WebSocket frame ordering |
| [15](15-plugin-author.md) | Plugin Author | Sam Torres | Mid | Engine contract, manifest compliance, dev/runtime alignment |
| [16](16-power-user.md) | Power User | Jake Morrison | Full | Scale stress test, queue reliability, session persistence under load |
| [17](17-local-sysadmin.md) | Local Sysadmin | Brendan Walsh | Mid | Port management, dependency recovery, restart safety |
| [18](18-cross-platform-installer.md) | Cross-Platform Installer | Yuki Tanaka | Mid | Platform-specific install edge cases, path spaces, GPU drivers |
| [19](19-automation-user.md) | Automation User | Ryan Chen | Mid | Idempotent batch automation, programmatic job status |
| [20](20-engine-maintainer.md) | Engine Maintainer | Dr. Sarah Kim | Mid | TTS contract stability, ETA semantics, marker timing |
| [21](21-qa-engineer.md) | QA Engineer | Marcus Webb | Mid | Reproducible failure paths, regression surface, state resets |
| [22](22-privacy-security-reviewer.md) | Privacy & Security Reviewer | Fatima Al-Rashid | Mid | Local-first trust, plugin sandboxing, path traversal |
| [23](23-queue-operator.md) | Queue Operator | Carlos Rivera | Mid | Live queue triage, stuck job recovery, ownership visibility |
| [24](24-observability-debugger.md) | Observability Debugger | Aiko Yamamoto | Mid | Event trace, frame causality, log noise reduction |
| [25](25-migration-recovery-operator.md) | Migration & Recovery Operator | Phil Garrett | Mid | State cutover, artifact stale detection, legacy path handling |
| [26](26-release-doc-maintainer.md) | Release Doc Maintainer | Nadia Fischer | Mid | Spec/code alignment, changelog completeness |

### Accessibility & Edge Cases

| # | Persona | Name | Depth | Why they're load-bearing |
|---|---|---|---|---|
| [27](27-casual-listener.md) | Casual Listener | Emma Patterson | Mid | Fast first success, minimal cognitive load, zero plugin knowledge |
| [28](28-nontechnical-author.md) | Nontechnical Author | Rosa Mendoza | Full | **Primary persona** — plain language, default trust, recovery UX |
| [29](29-screen-reader-producer.md) | Screen Reader Producer | Michael Osei | Mid | Keyboard-only, semantic structure, non-visual state feedback |
| [30](30-accessibility-qa.md) | Accessibility QA | Lily Chen | Mid | Focus order, modal behavior, non-color status indicators |
| [31](31-dyslexic-reader.md) | Dyslexic Reader | Connor Brady | Mid | Typography, visual hierarchy, reduced noise |
| [32](32-motor-impaired-keyboard-user.md) | Motor-Impaired Keyboard User | Diane Morales | Mid | No drag, no hover, forgiving keyboard paths |
| [33](33-deadline-editor.md) | Deadline Editor | Oliver Grant | Mid | Perceived speed, latency transparency, completion clarity |
| [34](34-teacher-builder.md) | Teacher Builder | Maya Robinson | Mid | Batch production, consistent voices, classroom-appropriate export |
| [35](35-small-team-marketer.md) | Small Team Marketer | Ben Nakamura | Mid | Collaboration clarity, version safety, publish confidence |
| [36](36-multilingual-author.md) | Multilingual Author | Sofia Andrade | Mid | Mixed-language chapters, locale fallback, pronunciation |
| [37](37-low-spec-laptop-user.md) | Low-Spec Laptop User | Liam O'Brien | Mid | UI under CPU/RAM/storage constraints |
| [38](38-offline-privacy-user.md) | Offline Privacy User | Nathan Holt | Mid | Local-first promise, plugin trust, cloud assumption visibility |
| [39](39-plugin-tinkerer.md) | Plugin Tinkerer | Victor Zhang | Mid | Fast try/compare/recover plugin install cycles |
| [40](40-support-triage-agent.md) | Support Triage Agent | Jenny Park | Mid | Diagnostics, debug state export, error attribution |
| [41](41-large-catalog-curator.md) | Large Catalog Curator | Harriet Brooks | Mid | List scale, search/filter/sort, safe bulk operations |
| [43](43-color-blind-user.md) | Color-Blind / Low-Vision User | Marcus Liang | Mid | State signaled by color alone; status orbs, swatches, banner contrast |

---

## How to Use in Review

Ask: **"What would [Name] want to know about this screen, and what would make them close the tab?"**

For ready-made multi-persona panels covering **every** persona (first-run, chapter editor, casting, queue, plugins, accessibility, publish, support), see [review-panels.md](review-panels.md). To compose a panel for a *novel* ask, or to check a panel for stance/level diversity, use the [persona-matrix.md](persona-matrix.md) trait view. The table below is just the highest-signal starting point per area — not the full mapping.

**High-signal pairings by design area:**

| Area | Use first | Also check |
|---|---|---|
| First-run / onboarding | Rosa (28), Emma (27) | Morgan (01) |
| Voice assignment / casting | Alex (06), Morgan (01) | Jake (16) |
| Voice cloning / training | Grace (42) | Alex (06) |
| Chapter editor — Voices mode | Alex (06), Morgan (01) | Rosa (28) |
| Performance annotation / delivery | Jimmy (05), Morgan (01) | Alex (06) |
| Queue and progress | Jake (16), Carlos (23) | Marta (07) |
| Plugin install / management | Victor (39), Sam (15) | Fatima (22) |
| Accessibility | Diane (32), Michael (29) | Lily (30), Connor (31), Marcus (43) |
| Export / publish | Sandra (09), Helen (12) | Marta (07) |
| Error recovery | Rosa (28), Jake (16) | Jenny (40) |
| Large-scale / performance | Jake (16), Harriet (41) | Liam (37) |

---

## Validation Backlog

In rough priority order — interview these real-world types to corroborate or challenge each persona:

1. **Rosa Mendoza (28)** — first-time self-published authors using any AI audiobook tool. Forum: r/selfpublishing, Reedsy community, ACX newcomers. Key question: where do first-timers abandon the workflow, and what language breaks down first?
2. **Alex Reyes (06)** — professional audiobook casting directors or voice directors at publishers. Key question: how is a casting decision documented, communicated, and revised in practice?
3. **Jake Morrison (16)** — high-volume freelance audiobook producers (ACX, Findaway). Key question: what are the most common failure modes in a 200-segment job, and what's the recovery flow?
4. **Morgan Chen (01)** — literary fiction authors who've done their own audiobook adaptation. Key question: how do authors think about delivery intent at segment level — what language do they use?
5. **Jimmy Calloway (05)** — professional narrators who work from producer-provided scripts. Key question: what information does a narrator need on a script card to deliver intent rather than just words?
