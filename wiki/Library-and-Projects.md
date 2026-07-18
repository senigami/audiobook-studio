# Library and Projects

The Library is your control center for all audiobooks in progress. Reach it from the left rail under **CREATE > Library**.

## Managing the Library

- **Browse**: View all projects as cards in the Library grid.
- **Sort**: Use the Library controls to sort projects by the current project metadata instead of hunting through cards manually.
- **New Book**: Use the **+ New Book** button to start a new book. The Series field suggests existing series names as you type, with a next-number hint for the position field, so continuing a series doesn't mean retyping its name.
- **Delete**: Projects can be removed via the context menu on the project card. _Warning: This removes all associated audio and text._

## Opening a Book

Clicking a book card opens it into the book's tab bar. The URL changes to `/book/:id/<tab>` (for example `/book/abc123/contents`). Each tab is a dedicated route:

| Tab | Route segment | Purpose |
|-----|--------------|---------|
| Book | `book` | Project identity (title, author, series, description, cover) and Continue Listening |
| Contents | `contents` | Chapter board: add, import, reorder, and open chapters |
| Cast | `cast` | Assign narrator and character voices |
| Lexicon | `lexicon` | Per-book pronunciation overrides |
| Publish | `publish` | Assemblies and final export |
| Backups | `backups` | Dated ZIP snapshots of the project |

Opening a chapter from Contents enters the **Chapter Workspace** at its own route, `/book/:id/chapter/:chapterId`.

Legacy `/project/:id` and `/chapter/:id` URLs still work — they redirect to the corresponding book pipeline route so bookmarks are not broken.

## Contents Tab

The Contents tab is where you manage the structure of your book.

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

## Cast Tab

The Cast tab is where you assign voices to narrators and characters.

- **Narrator (default)**: The first pinned row is always the Narrator — the fallback voice for any unassigned line.
- **Assign Profiles**: Link a project character to a Voice profile from your Voice Library.
- **Character Rows**: Additional characters in the cast are listed below the Narrator.

## Chapter Workspace: the Director's Console

The Chapter Workspace replaced the old separate Studio and Review stages with a single left-rail console offering four tools. Switch tools without losing your place — playback position carries over between them.

- **Cast**: Paint voice assignments directly onto text. Load a character as your "brush," then click or drag across segments to assign it. This is the same paint-assignment workflow the old Studio stage used.
- **Booth**: A karaoke-style follow-along listening view — the currently-playing text highlights as it plays, and you can flag or annotate sections and trigger a re-render from here. This is the old Review stage's listening/flagging workflow.
- **Revise**: Edit a paragraph's text in place without leaving the console.
- **Write**: A full chapter source editor for larger text changes — edit the whole chapter as raw text rather than paragraph by paragraph.

Other things you'll still find inside the Chapter Workspace:

- **Analysis Strip**: Per-chapter text stats and flags at a glance.
- **Section Annotations**: Annotate sections by number (§N) from Booth. Annotations attach to sections, never to timestamps, so they survive re-renders.
- **Global Player Bar**: The full-width bottom dock plays chapter audio while you work in any tool.

See [[Queue and Jobs]] for details on how generation jobs flow through the system.

## Publish Tab

The Publish tab is where you assemble and export the final audiobook.

- **Identity Strip**: A slim, read-only summary of the book's identity (title, author, series, cover). Editing happens on the **Book** tab, not here.
- **Assemblies**: A receipt-style history of every past assembly, including duration, file size, and a "Latest" badge.
- **Assemble Audiobook**: Compiles the final `.m4b` from the cached M4A chapter files.

Backups moved to their own **Backups** tab (see below).

### Assembly History

The Assemblies panel shows:

- **Relative Time**: How long ago the export was generated.
- **Metadata**: File duration and file size.
- **Latest Badge**: Marks the most recent export for quick identification.

### M4B Production

Assembly uses **Incremental Concatenation** — it stitches existing M4A chapter encodes together without re-encoding. Subsequent assemblies after partial chapter updates are fast.

## Backups Tab

The Backups tab lets you save or download dated ZIP snapshots of the project.

- **Save**: Writes a backup to the `backups/` folder inside the project directory.
- **Download**: Creates the same ZIP and sends it to your browser immediately.
- Saved backups are listed with their timestamp and comment; each row has a download link.

## Covers and Metadata

Book cover and metadata (title, author, series, description) are edited on the **Book** tab. The Publish tab shows them read-only in its identity strip.

---

[[Home]] | [[Queue and Jobs]] | [[Voices and Voice Profiles]]
