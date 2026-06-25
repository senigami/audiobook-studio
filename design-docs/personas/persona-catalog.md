# Persona Catalog

These personas are reusable lenses for adversarial testing and design review across Audiobook Studio 2.0.

## Creative And Editorial

### Novel Adapter

- `Role`: Author / adaptation lead.
- `Primary goals`: Preserve voice and intent; spot prose that needs audio-friendly trimming; keep chapter flow coherent.
- `Stress cases`: Long inner monologue; unbroken exposition blocks; narration that needs scene-break decisions.
- `Review lens`: Does the manuscript-to-audio workflow preserve authorial intent while making structure easier to perform and review?
- `Adversarial prompt`: Which parts of this chapter will sound flat or confusing when spoken, and how does the workflow surface that before export?

### Dialogue Playwright

- `Role`: Playwright / script writer.
- `Primary goals`: Make dialogue attribution obvious; separate stage directions from spoken lines; keep pacing readable for performers.
- `Stress cases`: Nested dialogue; parentheticals; mixed narration and script formatting.
- `Review lens`: Can the app distinguish script structure from prose without losing performance cues?
- `Adversarial prompt`: Can I see exactly which lines are dialogue, which are stage directions, and which are safe to send to a cast?

### Series Editor

- `Role`: Editor / continuity lead.
- `Primary goals`: Keep character names and facts consistent; track revisions across chapters; catch continuity breaks before recording.
- `Stress cases`: Renamed characters; scene order changes; chapter-level edits after casting.
- `Review lens`: Does the workflow prevent downstream re-recording and mismatched chapter metadata?
- `Adversarial prompt`: What changed since the last approved draft, and can I compare it against the recorded version fast?

### Copy Editor

- `Role`: Proofreader / line editor.
- `Primary goals`: Find typos and inconsistent punctuation; flag spoken awkwardness; verify punctuation-driven pauses.
- `Stress cases`: Homophones; dialogue punctuation errors; formatting drift across imports.
- `Review lens`: Can text cleanup make spoken quality and textual correctness visible in one pass?
- `Adversarial prompt`: Show me the exact lines that will cause the narrator to stumble or the TTS engine to misread.

### Narrator Performer

- `Role`: Voice actor / narrator.
- `Primary goals`: See performance notes clearly; manage character voices consistently; preview difficult lines before recording.
- `Stress cases`: Phonetic names; accent or tone shifts; late-stage script changes.
- `Review lens`: Does the performance workflow give narrators enough control without cluttering the reading flow?
- `Adversarial prompt`: Where do I get the pronunciation, character intent, and pickup list for this chapter in one place?

### Casting Director

- `Role`: Casting / voice director.
- `Primary goals`: Match voices to roles; compare auditions or voice options; avoid duplicate or conflicting assignments.
- `Stress cases`: Large cast books; similar-sounding characters; role reassignments after initial casting.
- `Review lens`: Are role-to-voice decisions traceable and easy to revise?
- `Adversarial prompt`: Can I compare the top three voice options for this role without losing the rest of the casting map?

### Audio Producer

- `Role`: Producer / post-production lead.
- `Primary goals`: Monitor queue health; spot bad renders quickly; manage retakes and final assembly.
- `Stress cases`: Partial failures; mixed-quality outputs; long queues with overlapping jobs.
- `Review lens`: Are production status, retries, and handoffs clear enough for release control?
- `Adversarial prompt`: Which jobs are safe to publish, which need a pickup, and which are hiding a failure behind a green status?

### Mastering Engineer

- `Role`: Audio engineer / finisher.
- `Primary goals`: Check loudness and consistency; catch clipping or silence gaps; ensure output is release-ready.
- `Stress cases`: Volume drift between chapters; bad pauses; exports with missing metadata.
- `Review lens`: Does the platform expose audio quality issues before final publish?
- `Adversarial prompt`: Where do I verify that this export is technically clean, not just successfully generated?

### Publisher Ops

- `Role`: Publisher / release manager.
- `Primary goals`: Confirm package completeness; control publish readiness; track versioned deliverables.
- `Stress cases`: Missing cover or metadata; wrong edition published; last-minute content swaps.
- `Review lens`: Do publication flows support safe release gating and auditability?
- `Adversarial prompt`: What exactly will ship if I click publish right now, and what is still incomplete?

### Localization Lead

- `Role`: Translator / localizer.
- `Primary goals`: Preserve meaning across languages; adapt names and idioms; keep voice settings aligned per locale.
- `Stress cases`: RTL scripts; culture-specific references; mixed-language chapters.
- `Review lens`: Do translation and voice generation stay linked without breaking structure or pronunciation?
- `Adversarial prompt`: How do I localize one chapter without losing character names, pacing, or voice assignment rules?

### Sensitivity Reader

- `Role`: Content reviewer / inclusivity reviewer.
- `Primary goals`: Flag harmful or outdated language; check representation in dialogue; identify risky performance choices.
- `Stress cases`: Stereotyped accents; problematic descriptors; context-heavy culturally specific material.
- `Review lens`: Are potentially harmful language and performance decisions easy to spot and discuss?
- `Adversarial prompt`: Can I isolate the lines that need review for tone, representation, or performance risk?

### Rights Manager

- `Role`: Publisher / rights clearance.
- `Primary goals`: Track source rights and version ownership; prevent unauthorized exports; keep adaptation scope bounded.
- `Stress cases`: Multi-author source material; licensed excerpts; partial-rights editions.
- `Review lens`: Does the workflow avoid accidental publication outside the allowed rights boundary?
- `Adversarial prompt`: Which parts of this project are cleared for audio release, and which are still restricted?

### Review-Only Proofreader

- `Role`: Editorial reviewer.
- `Primary goals`: Listen for narration mistakes; flag specific passages for correction; avoid changing anything else.
- `Stress cases`: Hard-to-find chapter positions; review state that looks editable; too much workflow noise around simple corrections.
- `Review lens`: Can review stay narrow, repeatable, and non-destructive?
- `Adversarial prompt`: Can I just review and annotate without accidentally starting a whole new workflow?

## Technical And Operator

### API Integrator

- `Role`: Integration engineer.
- `Primary goals`: Validate endpoint contracts; wire Studio to external services; handle retries and error mapping.
- `Stress cases`: Malformed preview/install payloads; unexpected WebSocket frame ordering; timeouts during GitHub or TTS Server calls.
- `Review lens`: Treat every API boundary as hostile until the contract and failure shape are explicit.
- `Adversarial prompt`: What breaks if a plugin or backend returns a valid-looking but incomplete payload?

### Plugin Author

- `Role`: Plugin developer.
- `Primary goals`: Implement a clean `StudioTTSEngine` contract; ship manifest and schema updates; keep runtime and dev-mode behavior aligned.
- `Stress cases`: Missing required methods; manifest/schema drift; dev fixtures that hide real runtime failures.
- `Review lens`: Optimize for plugin-owned behavior and canonical metadata, not app-level special cases.
- `Adversarial prompt`: Show me the smallest plugin that still exposes a bad contract before Studio accepts it.

### Power User

- `Role`: Advanced operator.
- `Primary goals`: Move quickly through large manuscript workflows; control queue and chapter state; swap voices and review outputs efficiently.
- `Stress cases`: Large libraries with many jobs; duplicate or stale preparing indicators; reloads that lose the active selection.
- `Review lens`: The UI should stay trustworthy under heavy use, fast changes, and partial completion.
- `Adversarial prompt`: After a reconnect, can I still tell which chapter and job are actually active?

### Local Sysadmin

- `Role`: System administrator.
- `Primary goals`: Keep Studio running locally; manage ports, paths, and permissions; recover from install or startup failures.
- `Stress cases`: Port collisions; broken dependencies or stale processes; leftover artifacts after crashes or updates.
- `Review lens`: Favor restart-safe behavior and minimal operator friction on a single machine.
- `Adversarial prompt`: Will this survive a reboot, a port conflict, and a half-failed plugin install?

### Cross-Platform Installer

- `Role`: Windows / macOS / Linux installer tester.
- `Primary goals`: Install without hand-editing scripts; understand platform-specific dependencies; recover cleanly from interrupted setup.
- `Stress cases`: Restricted permissions; missing compilers or GPU drivers; PowerShell/bash drift; path spaces.
- `Review lens`: Installation must be explicit, reversible enough to retry, and honest about platform limits.
- `Adversarial prompt`: What fails differently on Windows, macOS, and Linux, and does the user get a useful next step?

### Automation User

- `Role`: Workflow automation operator.
- `Primary goals`: Drive batch imports and renders; poll job status programmatically; build idempotent scripts around Studio.
- `Stress cases`: Duplicate submissions; races between enqueue and completion; eventual consistency in progress updates.
- `Review lens`: Automation should be predictable, idempotent, and easy to reconcile from logs and status.
- `Adversarial prompt`: If my script submits the same job twice, what exactly dedupes and what does not?

### Engine Maintainer

- `Role`: Model and adapter maintainer.
- `Primary goals`: Preserve marker and progress contracts; keep ETA and output semantics stable; validate engine-agnostic behavior in app code.
- `Stress cases`: Mixed-synthesis marker timing; child-engine fallback behavior; stale ETA or partial-progress reporting.
- `Review lens`: Contracts must survive engine changes without leaking engine-specific logic into the app core.
- `Adversarial prompt`: Does this still work when the engine changes its marker timing or returns partial progress?

### QA Engineer

- `Role`: Regression tester.
- `Primary goals`: Reproduce reported bugs precisely; verify fixes across reloads and reconnects; catch contract regressions early.
- `Stress cases`: Stale queue or segment state; broken edge paths in dialogs and modals; tests that pass only on initial render.
- `Review lens`: The best UI is one that fails loudly and reproducibly when its contract is broken.
- `Adversarial prompt`: What is the smallest reproducible sequence that proves this bug is really fixed?

### Privacy And Security Reviewer

- `Role`: Security reviewer.
- `Primary goals`: Protect local-first data boundaries; review plugin and archive trust flows; spot exfiltration and path traversal risks.
- `Stress cases`: Malicious plugin archives; symlink or path traversal installs; sensitive data leaking through logs or previews.
- `Review lens`: Assume untrusted input everywhere a plugin, repo URL, or archive can enter the system.
- `Adversarial prompt`: What can an untrusted plugin do before Studio asks for trust, and what stays local?

### Queue Operator

- `Role`: Queue operations specialist.
- `Primary goals`: Triage stuck jobs; inspect live queue metadata; recover from failed or inconsistent runs.
- `Stress cases`: Jobs that look finished but still own child work; hidden overlays or stale terminal states; ETA drift after updates.
- `Review lens`: Queue visibility must make real progress and real ownership obvious at a glance.
- `Adversarial prompt`: Which job is actually active right now, and how do I recover if the queue lies?

### Observability Debugger

- `Role`: Diagnostics analyst.
- `Primary goals`: Trace live events back to emitters; correlate WebSocket frames with UI state; reduce log noise and false ownership.
- `Stress cases`: Noisy or duplicated event streams; mixed source/classification fields; stale debug timelines masking the real emitter.
- `Review lens`: Diagnostics should explain causality, not just display history.
- `Adversarial prompt`: Which backend call emitted this frame, and how do I prove the consumer saw it once?

### Migration And Recovery Operator

- `Role`: Data migration specialist.
- `Primary goals`: Handle legacy state cutovers; detect stale artifacts safely; recover projects without corrupting active state.
- `Stress cases`: Mixed old/new state sources; legacy flags resurfacing; partially migrated artifacts after aborted updates.
- `Review lens`: Cutover paths should be explicit, reversible where possible, and easy to audit.
- `Adversarial prompt`: What exact stale state gets ignored, migrated, or deleted during cutover?

### Release Documentation Maintainer

- `Role`: Specs, changelog, and operator-doc maintainer.
- `Primary goals`: Keep specs aligned with shipped behavior; preserve migration rationale; make verification steps discoverable.
- `Stress cases`: Code/spec drift; duplicated planning docs; changelogs missing behavior changes.
- `Review lens`: A feature is not done if future maintainers cannot find the contract and verification path.
- `Adversarial prompt`: Which document would a future agent trust, and does it match the running behavior?

## Accessibility And Edge Cases

### Casual Listener

- `Role`: Casual user.
- `Primary goals`: Turn a manuscript into something listenable fast; use the default voice; accept the first good result.
- `Stress cases`: Too many settings; long setup flows; queue/review states misread as failures.
- `Review lens`: Optimize for obvious next steps, low cognitive load, and fast first success.
- `Adversarial prompt`: Can I make an audiobook in under 10 minutes without understanding plugins?

### Nontechnical Author

- `Role`: Independent writer.
- `Primary goals`: Upload a manuscript and get a usable draft audiobook; avoid plugin jargon; trust defaults unless something clearly needs attention.
- `Stress cases`: Plugin installation language; queue retries and partial failures; confusing review/edit/publish boundaries.
- `Review lens`: Does the product explain itself in plain language and recover gracefully?
- `Adversarial prompt`: I just want my book narrated. What do I click first?

### Screen Reader Producer

- `Role`: Accessibility user.
- `Primary goals`: Operate with keyboard and assistive tech; understand queue, review, and publish states from text alone; recover from errors without visual cues.
- `Stress cases`: Icon-only controls; focus traps in modals and drawers; status changes that are not announced.
- `Review lens`: Check semantic structure, focus order, labels, and non-visual state feedback.
- `Adversarial prompt`: Can I complete a full render-review-publish flow without using the mouse?

### Accessibility QA

- `Role`: Accessibility tester.
- `Primary goals`: Verify keyboard-only workflows; check focus order and modal behavior; validate readable status and progress cues.
- `Stress cases`: Tiny controls or crowded menus; focus traps in dialogs; status changes that are not perceivable without color.
- `Review lens`: A review surface is weak if it only works for mouse users with perfect vision.
- `Adversarial prompt`: Can I complete the workflow with only a keyboard and still understand every state change?

### Dyslexic Reader

- `Role`: Accessibility user.
- `Primary goals`: Read manuscript text comfortably; spot chapter and segment issues quickly; use clear visual hierarchy and stable navigation.
- `Stress cases`: Dense tables and cluttered menus; low-contrast text or tiny tap targets; overwhelming progress indicators.
- `Review lens`: Look for readable typography, spacing, contrast, and reduced visual noise.
- `Adversarial prompt`: Why is this screen so hard to scan and where is the one thing I need next?

### Motor-Impaired Keyboard User

- `Role`: Accessibility power user.
- `Primary goals`: Complete repeated actions without precision pointing; avoid drag-only controls; rely on predictable keyboard paths.
- `Stress cases`: Tiny hit targets; hover-only menus; reorder or scrub flows with no keyboard equivalent.
- `Review lens`: Every critical action should have a reachable, visible, and forgiving non-pointer path.
- `Adversarial prompt`: What can I not do if drag, hover, or precise clicking is unavailable?

### Deadline Editor

- `Role`: Impatient evaluator.
- `Primary goals`: Judge whether the workflow is fast enough; spot blockers immediately; compare results across voices and runs.
- `Stress cases`: Slow feedback after upload; hidden queue latency; unclear completion state or retry behavior.
- `Review lens`: Challenge responsiveness, perceived speed, and whether every wait has a clear purpose.
- `Adversarial prompt`: If I start a render right now, how soon do I know whether this is working?

### Teacher Builder

- `Role`: Educator.
- `Primary goals`: Turn lesson material into audio; manage multiple chapters or units; keep output appropriate for class use.
- `Stress cases`: Batching many short documents; voice consistency across lessons; export paths students can access.
- `Review lens`: Support repeatable classroom production, not just one-off narration.
- `Adversarial prompt`: Can I make five lesson audio files with consistent voices and no extra hand-holding?

### Small Team Marketer

- `Role`: Small-business team member.
- `Primary goals`: Convert newsletters, guides, and product docs into branded audio; coordinate review before publish; reuse approved voices and settings.
- `Stress cases`: Handoffs between collaborators; approval confusion; accidentally publishing the wrong version.
- `Review lens`: Evaluate collaboration clarity, version safety, and publish confidence.
- `Adversarial prompt`: How do we make sure the approved audio is the one that gets published?

### Multilingual Author

- `Role`: Multilingual user.
- `Primary goals`: Work with manuscripts containing multiple languages; choose natural voices across languages; preserve language-specific pronunciation and pacing.
- `Stress cases`: Mixed-language chapters; language selection buried in plugin settings; unexpected fallback voices or accents.
- `Review lens`: Look for explicit language handling, predictable fallback rules, and visible per-chunk overrides.
- `Adversarial prompt`: Will the app keep this chapter in Spanish and that quote in English without me micromanaging it?

### Low-Spec Laptop User

- `Role`: Constrained hardware user.
- `Primary goals`: Use the app on a slow machine; avoid browser freezes and memory spikes; keep long jobs visible without refreshing.
- `Stress cases`: Large manuscripts; heavy preview panes; multiple background jobs and animations.
- `Review lens`: Test whether the UI stays usable under limited CPU, RAM, and storage.
- `Adversarial prompt`: Can this still work when my laptop is already struggling?

### Offline Privacy User

- `Role`: Privacy-sensitive local-first user.
- `Primary goals`: Keep manuscripts and audio local; understand what never leaves the machine; avoid cloud assumptions.
- `Stress cases`: Unexpected network dependency; ambiguous plugin downloads; settings that imply remote services.
- `Review lens`: Check whether local-first promises are visible, credible, and preserved in defaults.
- `Adversarial prompt`: What exactly stays on my computer, and where do plugins change that?

### Plugin Tinkerer

- `Role`: Power user.
- `Primary goals`: Try new voices or plugins quickly; compare plugin behavior; recover from failed installs or bad configs.
- `Stress cases`: Trust and preview friction; broken plugin metadata; settings that do not explain their scope.
- `Review lens`: Press on install, preview, validation, and recovery paths.
- `Adversarial prompt`: If this plugin breaks, how do I know whether the app or the plugin is at fault?

### Support Triage Agent

- `Role`: Support / triage user.
- `Primary goals`: Diagnose failed jobs quickly; collect enough context to help a user; separate user error from app or plugin error.
- `Stress cases`: Poor error messages; missing job history; unclear queue provenance; no easy way to copy debug state.
- `Review lens`: Does the app expose enough structured diagnostics for fast support?
- `Adversarial prompt`: When a render fails, what exact evidence do I get to tell support what happened?

### Large Catalog Curator

- `Role`: Library operations user.
- `Primary goals`: Manage hundreds or thousands of books, voices, chapters, and outputs; find stale work fast; apply bulk decisions safely.
- `Stress cases`: Slow list rendering; weak search/filter/sort; destructive bulk operations without clear scope.
- `Review lens`: Scale turns nice UI into operational software; every list needs findability and safe bulk handling.
- `Adversarial prompt`: Can I find the one broken book in a thousand without opening every project?

## Coverage Gaps To Revisit

- Audio drama workflows with sound effects, music cues, and scene blocking.
- Regulated enterprise deployment, SSO, fleet policy, and audit retention.
- Marketplace/distributor-specific export validation.
- Non-Latin pronunciation review with IPA or specialized phonetic tooling.
- Children and young-adult safeguarding review beyond generic sensitivity review.
