# Page Style Guide — Audiobook Studio Handbook

The agreed structure for every handbook page. Goal: **direct, scannable, not wordy.**
One consistent skeleton; the body flexes by page type. (Informed by Diátaxis, simplified.)

## The skeleton (every page)

1. **Title + summary** — one or two sentences: what this is / what you'll do. (The `lede`.)
2. **At a glance** — a short callout with 2–4 bullets: key points and any prerequisites.
   A skimmer should be able to stop here and still get the gist.
3. **Body** — the direct explanation under short `##` headings. One idea per paragraph;
   prefer bullets and numbered steps over prose.
4. **Example** — at least one concrete example (command, code block, or worked scenario).
5. **Demo** — a scripted fake-cursor walkthrough *where it earns its place* (see policy below).
6. **Next / Related** — 2–3 links onward. Always present.

## Body varies by page type

Pick the type that fits; it only changes the Body + Example.

- **Concept** (Core Concepts, parts of Architecture): what it is → why it matters →
  how it works. No step lists. Links out to how-tos.
- **How-to** (User Guide): prerequisites → numbered steps → result → "if it goes wrong."
- **Reference** (API, manifest, env vars): lead sentence, then a **fields/params table**.
  Minimal prose; one short example per item. Optimized for lookup, not reading.
- **Tutorial** (Getting Started): one happy path, numbered start to finish, every step
  verified to work.

## Demo policy — "where it earns it"

Demos go on **key workflow pages**, not every page. First-pass targets:
- Getting Started → 5-minute tour
- User Guide → Chapter Editor (assign + generate + playback)
- User Guide → Voice Lab (create voice + variant + test)
- User Guide → Processing Queue (job advancing)

Every page gets at least one **example**; demos are added (per `DEMOS.md`) only where
motion clarifies a flow. Text + examples are written first; demos are a later pass.

## Writing rules

- **Bold the lead sentence** of a paragraph or step group so skimmers catch the point.
- **Length cap:** if a page scrolls past ~2 screens, split it or push detail to a
  reference/concept page. Don't re-explain concepts — **link** to them.
- **Callouts** (already styled): `tip`, `note`, `warning`, `progress` (Phase-12 "soon"),
  `future`. Use sparingly.
- **Voice:** second person, present tense, imperative for steps ("Open Settings →").
- **Show, then tell:** example or screenshot close to the instruction it illustrates.
- **No silent v1 behavior** described as current (per #111).

## Page front-matter (authoring)

Each page in `_tools/generate.py` carries its `type` (concept / how-to / reference /
tutorial) and a `demo` flag, so the generator can scaffold the right skeleton and we can
keep the whole site consistent from one source of truth.
