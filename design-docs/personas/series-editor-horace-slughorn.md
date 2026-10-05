# 03 · Series Editor  ☆ INFERRED

**Identity:** "I'm the person who catches the fact that 'Edris' became 'Aldric' in book three and nobody updated books four through seven — and I need to catch it before a single recording session happens, not after."

## Goals
- Identify every instance of a renamed or retconned character across all chapters before casting or rendering begins
- Compare the current manuscript draft against the version that was last cast or last recorded to catch drift
- Lock down character identities at the project level so editors can't accidentally introduce new name variants mid-series
- Track which chapters are in a "safe to record" state versus "edits pending" at a glance from the project list
- Prevent downstream re-recording by surfacing continuity errors as early as possible in the workflow

## Context & environment *(INFERRED)*
- Windows desktop workstation; manages manuscripts in Word with tracked changes; exports clean DOCX for import
- Brought in by the author's publisher to manage a 7-book fantasy series mid-production; several books already partially cast
- Works in review bursts: imports a revised chapter, audits the casting panel against a canonical character list she maintains externally, then either approves or flags for revision — she does not perform the recording or the voice casting herself

## Key workflow moments
- **Chapter import:** Imports a revised DOCX and immediately wants to know if any character names differ from the canonical list already in the project
- **Casting audit:** Opens the casting panel to verify that every character in the new chapter is matched to the correct voice profile, not a stale or duplicate entry
- **Cross-chapter scan:** Wants to search for a name string (e.g., "Edris") across all chapters to find unresolved legacy references before marking a chapter ready
- **Diff review:** Needs a before/after comparison between the current draft segments and the segments that were used in a prior render, down to the sentence level
- **Status control:** Sets per-chapter status flags (draft / reviewed / approved / locked) to communicate to the narrator and producer what's safe to record

## Top friction points *(INFERRED)*
- **F1 — No cross-chapter name search:** The app has no global find-across-chapters feature; the Series Editor must open every chapter individually to hunt for legacy character name variants
- **F2 — Silent cast drift:** When a chapter is re-imported with a revised manuscript, existing cast assignments don't update or warn — a renamed character silently gets a new uncast entry while the old voice profile becomes an orphan
- **F3 — No draft versioning:** The app stores the current segment text but doesn't retain the previous version, so comparing "what we recorded last week" against "what the author just revised" requires external tools
- **F4 — Status flags are missing:** There's no per-chapter approval state — everything looks equally "in progress" or "not started," giving them no way to communicate readiness to the narrator or producer without out-of-band messages

## What they need from the studio
- A global find-and-replace or search-across-project tool that scans all chapters for a name or phrase and shows matches in context
- A cast-reconciliation warning on re-import: "3 character names in this chapter don't match any existing cast entry — resolve before proceeding"
- A chapter-level status field (draft / reviewed / locked) visible from the project's chapter list
- A segment-level diff view showing what changed between the current text and the last committed render — even a simple highlight of modified segments would suffice
- A canonical character registry at the project level that flags new segments using non-canonical names at import time

## Review lens — questions they ask of any screen
- "Can I search for a character name across all chapters in this project without opening each one?"
- "Does the casting panel tell me if a character in the current chapter has no matching voice profile?"
- "What happens to cast assignments when I re-import a revised chapter — do they carry over or reset?"
- "How do I mark a chapter as approved so the narrator knows it's safe to record?"
- "Can I see which segments changed since the last time this chapter was rendered?"
- "Does the project list show me which chapters are locked versus still being edited?"
- "What happens if two chapters use slightly different spellings of the same character name?"

## Red flags that make them quit or distrust the app
- Re-importing a revised chapter and discovering cast assignments silently reset with no warning
- No way to search for a string across chapters — forces her back to Word as the source of truth
- A character she knows was renamed still appearing in the casting panel under the old name with an active voice profile
- Chapters showing no status distinction between "just imported" and "approved for recording"
- Discovering a render was completed on a draft segment she had flagged for revision, with no record of the discrepancy

**Evidence basis:** INFERRED. Interview series editors and continuity supervisors at audiobook publishers, particularly those managing multi-book productions; key open question is whether continuity enforcement belongs in the import pipeline or as a standing audit tool the editor runs on demand.
