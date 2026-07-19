# AR-1 reference — VRAM/CPU-aware dynamic concurrency auto-throttle

## The question restated

Each concurrent XTTS worker loads its own model copy into VRAM; the manifest ceiling was
raised 2→8 so `tts_parallel_cap`/`tts_engine_caps` is the user's real lever
(`design-docs/plans/FUTURE_WORK.md`, "Concurrency / rendering"). Design a mechanism where the
**effective** cap can drop below the configured max under live memory pressure and recover as
pressure eases — deciding (a) where sampling lives and how it feeds cap resolution, (b) the
hysteresis rule, (c) user visibility, (d) behavior when sampling itself fails — while
respecting: the single cap-resolution chokepoint, the import-side-effect ban, and no
engine-ID branching in core code.

## What I examined

- `app/orchestration/scheduler/cap_settings.py:119-156` — `resolve_effective_cap(engine_id, manifest_max, settings)`; today `effective = max(1, min(requested_cap, manifest_ceiling))` where `requested_cap` = per-engine override else global cap (`:151-156`). Docstring `:39-47` records INV-5 (one code path per engine, engine_id used only as a dict key) and "manifest is always the ceiling."
- `app/orchestration/scheduler/resources.py:626-631` — the live integration point: inside `reserve_task_resources`, when a claim carries `engine_class` + `engine_id` + `manifest_max`, the *live* limit is resolved **fresh on every admission attempt** via `resolve_effective_cap` and passed as `limit=` to `try_acquire` (`:699` class semaphore, `:706` per-engine-id semaphore).
- `app/orchestration/scheduler/resources.py:198-226` — `EngineClassSemaphore.try_acquire(task_id, limit=None)`: `effective = min(self._cap, limit)`; a live limit "can only ever narrow admission, never widen it" and never mutates the structural (grow-only) cap. This is exactly the shrink mechanism the throttle needs — semaphore caps themselves never shrink (`:340-369`, `:401-429`).
- `app/orchestration/scheduler/resources.py:43-45, 372-373` — `MAX_GLOBAL_CONCURRENT_SYNTHESIS` (env, default 8) backing `_global_cap_gate`, checked before the per-engine semaphores (`:676-688`).
- `app/orchestration/scheduler/resources.py:635-646` — the pause gate returns `admitted=False` with a human-readable `waiting_reason`; the same field carries semaphore denials — the existing "why is my task waiting" surface.
- `app/orchestration/progress/service.py:51-82` — `_resolve_pool_cap` mirrors `resolve_effective_cap` for the ETA bracket "so the ETA reflects the SAME cap the scheduler actually enforces," and falls back to 1 on failure per the no-fabrication principle. Any throttle folded into `resolve_effective_cap` is therefore *automatically* reflected in ETA math — a strong argument for putting the throttle inside the chokepoint rather than beside it.
- `app/api/ws.py:290, 686` — `broadcast_pause_state` and `broadcast_studio_event` (generic versioned studio-event envelope) as visibility precedents.
- `app/api/routers/engines_registry.py:44` — the engines API already reports the effective cap via the same function; it will show the throttled value for free.
- `app/core/boot.py:76-122` — `boot_studio()` → `boot_tts_server()`: the one sanctioned place to start threads/loops.
- `.agent/rules/modular_architecture.md` (per CLAUDE.md summary) — import must not start threads/listeners; no engine-ID branching; validated metadata over raw probing.
- `design-docs/plans/FUTURE_WORK.md` "Concurrency / rendering" — the captured item, plus the adjacent per-chapter-cap and silent-clamp-warning items that interact.

## Design

### 1. Sampling source, cadence, and home

New module **`app/orchestration/scheduler/memory_pressure.py`** containing a
`MemoryPressureMonitor` — a single daemon thread that samples every ~3 s (configurable
`TTS_PRESSURE_SAMPLE_SECONDS`) and maintains a thread-safe snapshot behind a lock:

- **VRAM**: `torch.cuda.mem_get_info()` when CUDA is available (free/total on the device the
  TTS server uses), else `nvidia-smi --query-gpu=memory.used,memory.total` as fallback, else
  MPS/`psutil` unified-memory on Apple Silicon. All device-level — it deliberately measures the
  *machine*, not any engine, which is what keeps INV-5 intact: the monitor never knows an
  engine_id exists.
- **CPU/RAM**: `psutil.virtual_memory().percent` (the owner's framing mentions CPU too; RAM
  percent is the actionable proxy — CPU% is noisy and self-correcting via the OS scheduler, so
  I would gate on memory only in v1 and record CPU as telemetry).

The module exports two pure functions: `get_pressure_penalty() -> int` (0 = no throttle,
N = "reduce effective cap by N slots") and `get_pressure_state() -> dict` (raw readings +
throttle level + `sampling_ok: bool`, for the API/UI). **Nothing starts at import** — the
thread is started by a `boot_memory_monitor()` called from `boot_studio()`
(`app/core/boot.py:76`), matching how `boot_tts_server()` owns the watchdog thread. Before
boot (and in tests), the snapshot is empty and the penalty is 0, so importing the module is
side-effect-free and behavior-neutral.

*Judgment call — penalty (subtract N slots) vs. absolute pressure-cap (min with a computed
max).* I chose a **step penalty** because the monitor cannot honestly compute "how many
workers fit" — per-worker VRAM varies by engine and model, and inventing a workers-per-GB
model would violate the repo's no-fabrication principle. A penalty of "one fewer than now"
is a claim the monitor can actually support ("we are near the limit at the current level").
Rejected alternative: estimating per-worker VRAM from manifest metadata — plausible later
(a versioned `behavior.vram_per_worker_mb` manifest field), but it adds a contract bump and
still guesses across model sizes.

### 2. Integration point with `resolve_effective_cap`

One line-of-principle change inside the chokepoint (`cap_settings.py:156`):

```
requested = engine_caps.get(engine_id) or global_cap
throttled = max(1, requested - get_pressure_penalty())   # never below 1
return max(1, min(throttled, manifest_ceiling))
```

(with the import local/lazy, matching the existing `_read_settings` pattern at
`cap_settings.py:59-65`, so cap_settings keeps zero import-time deps on the monitor).

Why here and nowhere else: `reserve_task_resources` already re-resolves the effective cap
**on every admission attempt** and feeds it as the narrowing `limit=` into both the class
semaphore and the per-engine-id semaphore (`resources.py:626-631, 699, 706`), and
`EngineClassSemaphore.try_acquire` is explicitly built so a live limit narrows without
mutating the grow-only structural cap (`resources.py:198-226`). So throttling inside
`resolve_effective_cap` gives us, with no new plumbing:

- throttle-down takes effect on the very next admission (already-running workers finish and
  release normally — we never kill in-flight work, we just stop admitting);
- recovery is equally automatic (next attempt resolves a higher value);
- the ETA bracket (`progress/service.py:79`) and the engines API
  (`engines_registry.py:44`) both call the same function, so ETAs and the settings surface
  reflect the throttled cap for free;
- the single-writer chokepoint constraint is preserved by construction — no second place
  decides the cap.

Floor of 1, not 0: dropping to 0 would be a silent stall (nothing admits, nothing tells the
user why beyond a waiting_reason). If pressure is so bad that even 1 worker OOMs, that's a
crash-and-recover path the watchdog/recovery already own, not a scheduling decision.
*Rejected alternative:* a separate "pressure gate" checked in `reserve_task_resources`
alongside the pause gate (`resources.py:635`). It would work, but it creates a second place
where the effective concurrency is decided, violating the chokepoint rule, and it would NOT
flow into the ETA math or the engines API.

**Per-chapter/per-engine semaphore interaction:** the throttle composes cleanly with both
existing gates — the per-engine-id semaphore (`resources.py:401-429`) receives the same
narrowed `limit` at `:706`, and the class semaphore at `:699`; the global backstop
(`:672-688`) is untouched. If the future per-chapter cap (FUTURE_WORK, same section) lands,
it should also consume `resolve_effective_cap`, and the throttle applies to it automatically —
another reason the penalty lives inside the chokepoint.

### 3. Hysteresis

Asymmetric two-watermark rule with dwell times, computed inside the monitor thread (so
`get_pressure_penalty()` is a pure read):

- **Throttle down** (penalty += 1, may repeat): VRAM used ≥ **90%** for **2 consecutive
  samples** (~6 s). Two samples, not one, filters transient allocation spikes during model
  load; but down-steps are deliberately fast because the cost of being slow is an OOM that
  loses in-flight work.
- **Recover** (penalty −= 1, one step at a time): VRAM used ≤ **75%** for **10 consecutive
  samples** (~30 s) AND at least **60 s** since the last down-step. Slow, single-step
  recovery is the anti-oscillation core: adding a worker itself raises VRAM, so a fast
  symmetric rule would flap (admit → spike → throttle → drain → admit …). The 15-point gap
  between watermarks plus the dwell time means the system must be *stably* below the low
  mark before it re-grows.
- Penalty is clamped to `[0, configured_cap - 1]`.

Thresholds/cadence configurable via settings (same settings-then-env pattern as
`cap_settings.py:68-86`), defaults as above. This is a judgment call; the alternative —
proportional control (penalty as a function of headroom) — was rejected as
tuning-sensitive and harder to explain in the UI than "reduced by N because memory stayed
above 90%."

### 4. Visibility (never a silent stall)

Three surfaces, all reusing existing plumbing:

1. **Event**: on every penalty change the monitor calls a small callback (registered at
   boot, not at import — the listener-registration ban) that emits a versioned frame through
   `broadcast_studio_event` (`app/api/ws.py:686`), e.g.
   `{type: "concurrency_throttle", v: 1, penalty, reason: {vram_used_pct, threshold}, sampling_ok}`.
   Frontend shows a banner/badge on the render monitor: "Parallel rendering reduced 4 → 3
   (GPU memory 92%)". This is the same shape as `broadcast_pause_state` (`ws.py:290`).
2. **Waiting reason**: when admission is denied *because* the throttled limit is below the
   structural cap, the `waiting_reason` (`resources.py:608-609`) should say so —
   "Waiting: concurrency reduced under memory pressure (3/4 slots)" — rather than the generic
   semaphore message, so the per-task "why am I queued" answer is honest.
3. **Settings/engines API**: `engines_registry.py:44` already reports the effective cap;
   add the pressure state (`get_pressure_state()`) to the system/engines payload so the
   Settings UI can render *requested vs. effective* — which also directly serves the
   adjacent FUTURE_WORK item ("Settings UI silent-clamp warning": nothing tells the user
   their input was clamped).

### 5. Sampling-failure fallback

**Fail-open to the user's configured cap** (`penalty = 0`), with the failure made visible —
after 3 consecutive sampling failures the monitor sets `sampling_ok = False` in its state,
emits one `concurrency_throttle` frame flagging degraded monitoring, and logs at WARNING; it
keeps retrying at the normal cadence and clears the flag on the first good sample.

Reasoning: absent a reading, any throttle value would be fabricated — the repo's
no-fabrication principle (applied to ETA at `progress/service.py:61-63`, "an unresolvable
cap must never inflate/deflate") applies equally here. The user's explicit setting remains
the authority it is today; a machine with no working sampler is exactly today's shipped
behavior, which is acceptable, whereas silently pinning to cap=1 would be an invisible 4-8×
throughput loss. *Rejected alternative:* fail-conservative (drop to 1 on sampler failure).
Defensible for OOM-avoidance, but it converts a monitoring bug into a silent product
regression, and the constraint being protected (OOM) already has a recovery path
(watchdog restart + task recovery), while a stealth 1-worker stall has none. The middle
ground — fail-open but *freeze* an already-active penalty rather than releasing it (don't
recover on no data) — I would actually adopt: penalty decay requires evidence of low
pressure; sampler failure holds the current penalty and never increases it.

### Engine-neutrality check (INV-5)

The monitor samples devices, not engines; the penalty applies inside the one function that
runs identically for every `engine_id` (`cap_settings.py:127-128` — "engine_id is used only
as a dict key"). No core code gains an engine-ID branch. Engines that declare
`max_concurrent_workers = 1` (Voxtral/Mixed) are unaffected in practice since
`max(1, ...)` floors at their ceiling.

## Confidence & what would change it

**High (0.85)** on the integration point and failure fallback — the per-attempt live-limit
plumbing (`resources.py:626-631, 699, 706`; `EngineClassSemaphore.try_acquire`
`:198-226`) was visibly built for exactly this, and the no-fabrication precedent is
explicit in-repo. **Medium (0.6)** on the specific hysteresis numbers (90/75%, 6 s/30 s/60 s)
— these are engineering judgment; real XTTS VRAM traces (spikiness of allocation during
model load and chunk synthesis) could move both watermarks and the down-step sample count.
The design would change materially if (a) per-worker VRAM turned out predictable enough
that a manifest-declared `vram_per_worker_mb` beats a reactive penalty (then throttle
proactively at admission time instead), or (b) the TTS server subprocess boundary means the
Studio process can't see the relevant GPU context (then sampling should live in
`app/tts_server/health.py` and ride back on the existing `/health` heartbeat the watchdog
already polls — same design, different transport).

## What I could not determine from the evidence here

- Whether `torch`/CUDA is importable in the **Studio** process at all (XTTS deps live in the
  separate `~/xtts-env`; the root env may lack torch), which decides between in-process
  `mem_get_info` vs. `nvidia-smi` subprocess vs. the tts_server `/health` transport above.
  I did not read `app/tts_server/health.py` or the watchdog heartbeat payload to confirm
  whether a memory field could ride it.
- Real per-worker VRAM footprints (no measurement data in-repo), so watermark defaults are
  untuned judgment.
- The exact current `waiting_reason` strings produced by semaphore denials (I read the
  mechanism, not the message constants), so item 4.2's wording is a spec, not a diff.
