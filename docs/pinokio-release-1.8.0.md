# Audiobook Studio 1.8.0

- XTTS stays the private local-default engine.
- Voxtral support is now available as an optional cloud voice path behind Settings with your own Mistral API key.
- Voices now store their engine per profile, so XTTS and Voxtral can live together in the same project.
- Mixed-engine chapters render through real displayed chunk groups instead of fragile sentence-by-sentence artifacts.
- Queue recovery, progress sync, and chunk labeling are much more reliable during repair and regeneration work.
- Segment and chapter generation now match the displayed Performance and Production groupings more closely.
