# Lessons — always-on index
last-curated: 2026-07-06

These fire every session (auto-loaded via CLAUDE.md). Topic bodies live in `topics/` — read a shard only when its pointer matches. Cap: 10 always-on lessons; when full, demote the least-actionable into a shard rather than deleting it.

## Always-on lessons
- A "default raised" commit doesn't mean a feature is live if the codebase uses "ships dark" staged rollout — check for a separate enable gate (2026-07-06) — `92bbb443` raised `tts_parallel_cap`'s default 1→2 and shipped a Settings toggle, but `app/orchestration/scheduler/resources.py`'s `_engine_class_admission_enabled()` (env-gated via `ENGINE_CLASS_ADMISSION`, meant to flip in W-PAR task 007 but never did) still defaulted OFF — so every synthesis claim kept routing through the legacy single-flight exclusive gate and renders stayed genuinely sequential regardless of the cap setting. Cost a full owner-reported debugging round to find. **Apply:** when a change raises a cap/limit/default value in this repo (especially anything tagged W-PAR or described as "ships dark"), grep for the matching `_*_enabled()`/env-var admission gate that actually turns the behavior on — a raised limit with the gate still off changes nothing observable.

## Topic pointers (read on match)
<!-- Add a line here when a lesson needs more than one sentence: "<trigger keywords> → topics/<name>.md" -->
