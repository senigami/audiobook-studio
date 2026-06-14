# Library and Projects

The Library is your control center for all audiobooks in progress. Reach it from the left rail under **CREATE > Library**.

## Managing the Library

- **Browse**: View all projects as cards in the Library grid.
- **Sort**: Use the Library controls to sort projects by the current project metadata instead of hunting through cards manually.
- **New Book**: Use the **+ New Book** button to start a new book.
- **Delete**: Projects can be removed via the context menu on the project card. _Warning: This removes all associated audio and text._

## Opening a Book

Clicking a book card opens it into the **Book Pipeline** — a routed set of five stage tabs. The URL changes to `/book/:id/<stage>` (for example `/book/abc123/manuscript`). Each stage is a dedicated route:

| Stage | Route segment | Purpose |
|-------|--------------|---------|
| Manuscript | `manuscript` | Add, edit, and import chapter text; text analysis |
| Casting | `casting` | Assign narrator and character voices |
| Studio | `studio` | Generate and repair audio segments; script view |
| Review | `review` | Follow-along playback; per-section annotations |
| Publish | `publish` | Book metadata, assemblies, backups, export |

Legacy `/project/:id` and `/chapter/:id` URLs still work — they redirect to the corresponding book pipeline route so bookmarks are not broken.

## Manuscript Stage

The Manuscript stage is where you manage the structure and text of your book.

- **Add Chapter**: Upload a `.txt` file or paste text directly.
- **Reorder**: Drag and drop chapters to change their sequence.
- **Text Analysis**: The analysis strip shows segment counts and flags long sentences for review.
- **Chapter Status Orbs**: Each chapter row displays a **Status Orb** with integrated render-state indicators (see below).

### Status Indicators (Status Orb)

Each chapter features a **Status Orb** that provides instant visual feedback and common actions:

- **Central Fill**: Shows the state of the master WAV (Green = Success, Orange = Out of Sync, Spinner = Rendering).
- **Integrated Arcs**: Two subtle arcs on the outer ring show the availability of distribution formats:
  - **Top-Left Arc**: M4A availability.
  - **Top-Right Arc**: MP3 availability.
- **Opacity States**: Present formats are bold; missing formats appear as light grey placeholders.

**Pro Tip**: Click any non-rendering Orb to access a contextual action menu (e.g., "Rebuild Audio", "Queue Remaining").

## Casting Stage

The Casting stage is where you assign voices to narrators and characters.

- **Narrator (default)**: The first pinned row is always the Narrator — the fallback voice for any unassigned line.
- **Assign Profiles**: Link a project character to a Voice profile from your Voice Library.
- **Character Rows**: Additional characters in the cast are listed below the Narrator.

## Studio Stage

The Studio stage is the primary audio production view.

- **Book View (primary)**: Displays the full chapter list with rendered audio status and generate controls.
- **Script View**: A secondary view showing the raw text with per-segment generation controls.
- **Cast Palette**: A right-hand panel for painting voice assignments directly onto segments.
- **Analysis Strip**: Shows per-chapter text stats and flags at a glance.
- **View Toggles**: Safe-text and section-number toggles for production review.

See [[Queue and Jobs]] for details on how generation jobs flow through the system.

## Review Stage

The Review stage provides a follow-along listening experience.

- **Global Player Bar**: The full-width bottom dock plays chapter audio. The scope chip lets you cycle playback scope.
- **Section Annotations**: Annotate sections by number (§N). Annotations attach to sections, never to timestamps, so they survive re-renders.
- **Re-render Section**: The primary gesture for fixing a section is to trigger a re-render from here.

## Publish Stage

The Publish stage is where you edit book metadata and export the final audiobook.

- **Book Info**: Edit the title, author, series, and cover art here (not in Manuscript, which is read-only for metadata).
- **Assemblies**: A receipt-style history of every past assembly, including duration, file size, and a "Latest" badge.
- **Backups**: Save or download dated ZIP snapshots of the project (with or without audio).
- **Assemble Audiobook**: Compiles the final `.m4b` from the cached M4A chapter files.

### Assembly History

The Assemblies panel shows:

- **Relative Time**: How long ago the export was generated.
- **Metadata**: File duration and file size.
- **Latest Badge**: Marks the most recent export for quick identification.

### M4B Production

Assembly uses **Incremental Concatenation** — it stitches existing M4A chapter encodes together without re-encoding. Subsequent assemblies after partial chapter updates are fast.

### Backups

The Backups panel lets you save or download dated ZIP snapshots of the project.

- **Save**: Writes a backup to the `backups/` folder inside the project directory.
- **Download**: Creates the same ZIP and sends it to your browser immediately.
- Saved backups are listed with their timestamp and comment; each row has a download link.

## Covers and Metadata

Book cover and metadata (title, author, series) are edited in the **Publish** stage under Book Info.

---

[[Home]] | [[Queue and Jobs]] | [[Voices and Voice Profiles]]
