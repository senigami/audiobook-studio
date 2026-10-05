# 38 · Offline Privacy User  ☆ INFERRED

**Identity:** "A journalist writing a sensitive memoir who chose local-first explicitly and needs the app to be honest and specific about exactly what data leaves his machine — and when a plugin changes that."

## Goals
- Keep manuscript text, audio samples, and rendered audio entirely on his machine
- See a clear, honest disclosure of every network action the app or its plugins may take
- Understand which plugins are network-connected and which are fully offline before installing
- Know whether the voice library, engine, or any feature implies a cloud service in its defaults
- Trust the app's privacy claims because they are specific and verifiable — not because of marketing language

## Context & environment *(INFERRED)*
- MacBook Pro, runs macOS with Little Snitch or similar outbound firewall; will notice unexpected connections
- Works in airplane mode by choice during writing sessions; the app must function without internet
- Has prior experience with tools that described themselves as "local" but phoned home for licensing, telemetry, or update checks
- Not paranoid arbitrarily — his subject matter carries real operational security implications
- Came to Audiobook Studio after reading the local-first description; the first thing he did was check whether it needed internet

## Key workflow moments
- **First launch:** Reads any onboarding or settings screen for network-related language; expects an honest network-usage summary, not buried fine print
- **Plugin install:** Inspects a plugin's manifest or description before installing; expects each plugin to declare its network behavior explicitly — offline, update-check-on-start, requires-connection, etc.
- **Voice library browse:** Opens the voice library expecting local voices only; is alarmed when he sees "cloud voices" listed without a clear visual boundary from local ones
- **Settings inspection:** Reviews every settings field looking for API endpoints, remote service URLs, or features that imply remote calls; expects these to be labeled and opt-in, not opt-out
- **Offline render:** Starts a full render with his machine in airplane mode; expects the render to complete without error — no silent failures because a plugin tried and failed to reach a remote service

## Top friction points *(INFERRED)*
- **F1 — "Cloud voices" appear in the voice library without a clear boundary:** the Offline Privacy User sees cloud-hosted voices mixed into the same list as local voices with no distinct visual treatment. The label is small and easy to miss. They cannot tell at a glance whether installing one would send his manuscript text off-device.
- **F2 — A plugin checks for updates on startup without disclosure:** One plugin makes an outbound call at launch. This is not disclosed in the manifest or plugin detail screen. their firewall blocked it silently, but they only found out by reviewing firewall logs — not from the app.
- **F3 — API endpoint setting has no explanation:** A settings field labeled "TTS API endpoint" with a pre-filled URL appears in the app. the Offline Privacy User doesn't know whether this is used by default, whether it is a local loopback address, or whether it points to an external service. There is no tooltip or inline explanation.
- **F4 — "Local-first" is a marketing claim, not a specification:** The homepage and README say "local-first" but don't define what that means precisely: does it mean no data leaves by default, no data leaves ever, or just that the app can run without cloud services?

## What they need from the studio
- A network-usage disclosure screen accessible from settings: one sentence per component (core app, each plugin) stating exactly what network calls it makes and when, with links to source if open
- Plugin manifests that expose a `network_access` field with an enumerated value: `none`, `update_check`, `requires_connection` — and this surfaced prominently in the plugin install UI
- Visual separation of local vs. cloud voices in the voice library, with cloud voices collapsed or gated behind an explicit opt-in
- Tooltips on any setting that references a URL or API endpoint, explaining whether it is a local loopback, a local network address, or an external service
- A "local-only mode" toggle that disables all optional network activity (update checks, telemetry if any) and confirms which features are unavailable as a result

## Review lens — questions they ask of any screen
- "Does anything on this screen trigger a network call, and if so, what data does it send?"
- "Is this voice local or does rendering it send my text to an external service?"
- "What does this API endpoint setting do — is this a local server address or a remote one?"
- "If I'm in airplane mode, will this still work?"
- "Does installing this plugin change the network behavior of any existing feature?"
- "Where is the specific, non-marketing description of what 'local-first' means for this app?"
- "If I decline the update check, does anything break or degrade silently?"

## Red flags that make them quit or distrust the app
- An outbound network call occurs without prior disclosure, regardless of what data it sends
- Cloud voices and local voices are visually indistinct in the library — the type of content he could load is ambiguous
- The word "local-first" appears in the UI as a trust signal without any linked definition or detail
- A render fails in airplane mode due to a plugin network dependency that was never disclosed
- Settings fields that reference remote services have no explanation and are pre-filled with external URLs

**Evidence basis:** INFERRED. Interview journalists, lawyers, independent researchers, and security-conscious creative professionals who handle sensitive source material to validate whether a network-disclosure screen satisfies their needs or whether they require app-level firewall controls and audit logs of all outbound requests.
