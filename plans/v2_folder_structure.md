# Proposed Folder Structure: Audiobook Studio 2.0

To avoid relying completely on `_v2` suffixes, we can adopt a more domain-driven architecture for the application. By naming folders according to their specific responsibility in the new architecture, we naturally separate the old code from the new while setting a clean foundation for future growth.

## The Backend Architecture (`app/`)

The current `app/` structure has a mix of routes, models, state, and tight-coupled worker scripts. The 2.0 structure will group files by their core domain.

```text
app/
├── api/                  # (Existing) FastAPI routers and endpoints
│   ├── routes/           # Standardized API routes
│   └── websockets/       # Dedicated folder for WS connection managers (Layer 1)
│
├── core/                 # Shared foundational utilities
│   ├── config.py         # Central configuration and env variables
│   ├── security.py       # Path validation, sanitization
│   └── state_manager.py  # (New) Replaces state.py. Memory/Redis abstraction.
│
├── db/                   # (Existing) SQLite models, migrations, DB connections
│   ├── schema/           # Future extraction of SQLAlchemy/SQLModel definitions
│   └── queries/          # Reusable DB logic
│
├── desktop/              # Specific logic for local system integration
│   └── subprocess.py     # Safe execution wrappers for ffmpeg, etc.
│
├── domain/               # (New) The heart of Audiobook Studio 2.0
│   ├── projects/         # Logic for managing project lifecycle and chapters
│   │   ├── models.py     # Project-specific data structures
│   │   └── services.py   # Project creation, deletion, validation
│   ├── library/          # Logic for managing global voice library tools
│   └── textops/          # (Moved) Chapter splitting and text sanitization
│
├── orchestration/        # (New) Replaces `jobs/`. The generic Task Queue.
│   ├── orchestrator.py   # The actual queue loop and Semaphore locking
│   ├── progress.py       # The standalone ETA and Piece-Mapping service
│   └── runtimes/         # Logic for heavy vs light thread pools
│
└── plugins/              # (New) Replaces `engines/`. Modular add-ons.
    ├── __init__.py       # Plugin registry and Loader
    └── voice/            # Voice synthesis engines
        ├── base.py       # The `BaseVoiceEngine` interface contract
        ├── xtts/         # XTTS specific plugin folder
        │   ├── engine.py
        │   └── settings_schema.json
        └── voxtral/      # Voxtral specific plugin folder
            ├── engine.py
            └── settings_schema.json
```

### Why this is better:
- **`plugins/voice/` vs `engines/`**: By moving engines into a `plugins` directory, we clearly signal that these are modular, self-contained units. The legacy `engines.py` can remain untouched while we build the new system here.
- **`orchestration/` vs `jobs/`**: "Jobs" often implies hard-coded scripts (like `worker.py`). "Orchestration" defines a service that manages generic task execution, perfectly embodying the new 2.0 generic queue.
- **`domain/`**: Separates the business logic (What is a project? How do we split text?) from the delivery mechanism (API, Websockets).

---

## The Frontend Architecture (`frontend/src/`)

The frontend is already relatively clean, but we need to accommodate the new Zustand layers and separate the "Editor" from the "Library" more cleanly.

```text
frontend/src/
├── api/                  # Layer 2: Hard-truth REST API fetching (React Query / Fetch wrappers)
│
├── components/           # Reusable, "dumb" UI elements (Buttons, Layouts, Inputs)
│   ├── ui/               # Primitive components (GlassInput, GhostButton)
│   └── shared/           # Complex but reusable (ProgressOrb, ConfirmModal)
│
├── features/             # (New) Feature-driven, "smart" modules
│   ├── chapter-editor/   # Everything related explicitly to the Editor interface
│   ├── project-library/  # Everything related explicitly to the project dashboard
│   ├── voice-modules/    # The new "Installed Voice Modules" management UI
│   └── global-queue/     # The progress tracking components
│
├── store/                # (New) Layer 1: Zustand real-time reactive state
│   ├── useJobStore.ts    # Websocket-driven job states
│   └── useProjectStore.ts# Local cache for project metadata
│
├── lib/                  # (New) Shared frontend services
│   └── websocket.ts      # The connection manager that dispatches to the store
│
└── styles/               # Global CSS and layout tokens
```

### Why this is better:
- **`features/` vs `components/`**: Currently, massive "smart" pages like `ChapterEditor.tsx` are sitting right next to tiny "dumb" components like `GhostButton.tsx`. Grouping by feature makes it much easier to scale the application.
- **`store/`**: Formally houses the Zustand state architecture, separating the real-time data from the API request handlers.
