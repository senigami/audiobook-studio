# Library and Projects

The Library is your control center for all audiobooks in progress.

## 📚 Managing the Library

- **Browse**: View all projects as cards.
- **New Project**: Use the floating "+" button to start a new book.
- **Delete**: Projects can be removed via the context menu on the project card. _Warning: This removes all associated audio and text._

## 📂 Project View

Once you open a project, you'll see several tabs:

### 1. Chapters Tab

This is where you manage the structure of your book.

- **Add Chapter**: Upload a `.txt` file or paste text directly.
- **Reorder**: Drag and drop chapters to change their sequence.
- **Metadata**: Click the settings icon to change title, author, or the book's cover.
- **Assemble Audiobook**: Located at the top right of the Project View.

#### Status Indicators (Status Orb)

Each chapter features a **Status Orb** that provides instant visual feedback and common actions. The orb is now a cohesive widget with integrated indicators:

- **Central Fill**: Shows the state of the master WAV (Green = Success, Orange = Out of Sync, Spinner = Rendering).
- **Integrated Arcs**: Two subtle arcs on the outer ring show the availability of distribution formats:
  - **Top-Left Arc**: M4A availability.
  - **Top-Right Arc**: MP3 availability.
- **Opacity States**: Present formats are bold; missing formats appear as light grey placeholders.

**Pro Tip**: Click any non-rendering Orb to access a contextual action menu (e.g., "Queue rebuild", "Queue remaining").

![Project View highlighting the Chapters list and Assembly button](images/project-view.jpg)

### 2. Characters Tab

Manage the personas within your project.

- **Assign Profiles**: Link a project character to a Voice Variant from the AI Voice Lab.
- **Bulk Actions**: Select multiple segments to generate audio or change voices at once.

![Characters tab showing persona mapping to AI voices](images/characters-tab.jpg)

## 📝 Chapter Editor

Clicking a chapter opens the **Chapter Editor**, which has four primary workflows:

1. **Edit**: Raw text entry and cleanup.
2. **Production**: Quick voice assignment by highlighting text.
3. **Performance**: Granular segment management, playback, and per-segment generation.
4. **Preview**: See how the text will be partitioned by the engine.

![Chapter Editor showing the Performance tab and audio segments](images/chapter-editor.jpg)

## 📦 Export and Assembly

Located at the top-right of the Project View, the **Assemble** hub is where you compile your final audiobook.

### 1. Assembly History

The right-hand panel provides a clean, "receipt-style" timeline of all previous exports:

- **Relative Time**: Displays how long ago the export was generated (staying in hours for up to 72 hours).
- **Metadata**: Shows file duration (e.g., `3h 32m`) and precise file size.
- **Latest Badge**: Automatically marks the most recent export for quick identification.

### 2. M4B Production

When you assemble a book, the engine uses **Incremental Concatenation**. It stitches together existing M4A chapter encodes losslessly, making subsequent assemblies nearly instantaneous.

## 🖼️ Covers and Metadata

---

[[Home]] | [[Queue and Jobs]] | [[Voices and Voice Profiles]]
