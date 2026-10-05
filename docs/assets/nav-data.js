/* Audiobook Studio 2.0 handbook — single source of truth for navigation.
   Loaded via <script>, so it works on file:// and GitHub Pages with no AJAX/CORS.
   hb-nav.js reads window.HB_NAV and injects the shared chrome into every page,
   so the sidebar is defined ONCE here, never duplicated per page. */
window.HB_NAV = {
  brand: "Audiobook Studio",
  github: "https://github.com/senigami/audiobook-studio",
  parts: [
    {
      title: "For Users",
      sections: [
        { dir: "overview", title: "Overview", pages: [
          { slug: "what-is-audiobook-studio", title: "What Is Audiobook Studio" },
          { slug: "studio-2-at-a-glance", title: "Studio 2.0 at a Glance" },
          { slug: "use-cases", title: "Who It's For & Use Cases" },
          { slug: "privacy-model", title: "Local-First & Privacy" },
          { slug: "feature-highlights", title: "Feature Highlights" }
        ]},
        { dir: "getting-started", title: "Getting Started", pages: [
          { slug: "requirements", title: "Requirements" },
          { slug: "installation", title: "Installation Paths" },
          { slug: "launchers", title: "Launcher Scripts" },
          { slug: "environments", title: "The Two Environments" },
          { slug: "first-run", title: "First Run" },
          { slug: "demo-library", title: "Demo Library" },
          { slug: "quick-tour", title: "5-Minute Workflow Tour" },
          { slug: "platform-validation", title: "Platform Support & Validation" }
        ]},
        { dir: "concepts", title: "Core Concepts", pages: [
          { slug: "content-hierarchy", title: "Content Hierarchy" },
          { slug: "characters-narrators", title: "Characters & Narrators" },
          { slug: "voices", title: "Voices, Variants & Samples" },
          { slug: "engines-overview", title: "Engines Overview" },
          { slug: "production-pipeline", title: "The Production Pipeline" },
          { slug: "artifacts-recovery", title: "Artifacts, Reuse & Recovery" }
        ]},
        { dir: "user-guide", title: "User Guide", pages: [
          { slug: "project-library", title: "Project Library", flag: "soon" },
          { slug: "project-workspace", title: "Project Workspace" },
          { slug: "chapters-tab", title: "Chapters" },
          { slug: "characters-tab", title: "Characters" },
          { slug: "assemblies-tab", title: "Assemblies & Export" },
          { slug: "backups-tab", title: "Backups" },
          { slug: "chapter-editor", title: "Chapter Editor", flag: "soon" },
          { slug: "voice-lab", title: "Voice Lab" },
          { slug: "voice-tags-icons", title: "Voice Icons & Tags", flag: "soon" },
          { slug: "processing-queue", title: "Processing Queue", flag: "soon" },
          { slug: "settings", title: "Settings" },
          { slug: "audio-formats", title: "Audio Guidance & Formats" },
          { slug: "troubleshooting", title: "Troubleshooting & FAQ" }
        ]},
        { dir: "engines", title: "Engines & Voice Cloning", pages: [
          { slug: "xtts", title: "Local Engine (XTTS Default)" },
          { slug: "voxtral", title: "Cloud Engines (e.g. Voxtral)" },
          { slug: "composite", title: "Composite Synthesis" },
          { slug: "engine-settings", title: "Engine Settings & Verification" },
          { slug: "voice-quality", title: "Voice Cloning Quality" }
        ]},
        { dir: "whats-new", title: "What's New in 2.0", pages: [
          { slug: "at-a-glance", title: "1.x → 2.0 at a Glance" },
          { slug: "architectural-shifts", title: "Architectural Shifts" },
          { slug: "new-capabilities", title: "New Capabilities" },
          { slug: "migration", title: "Migration Notes" },
          { slug: "pr-talking-points", title: "PR Talking Points" },
          { slug: "changelog", title: "Changelog" }
        ]},
        { dir: "reference", title: "Reference", pages: [
          { slug: "glossary", title: "Glossary" },
          { slug: "file-formats", title: "File Formats" },
          { slug: "ui-cheat-sheet", title: "UI Cheat Sheet" }
        ]}
      ]
    },
    {
      title: "For Developers & Integrators",
      sections: [
        { dir: "plugin-sdk", title: "Plugin SDK", pages: [
          { slug: "overview", title: "Plugin Architecture" },
          { slug: "anatomy", title: "Anatomy of a Plugin" },
          { slug: "manifest", title: "manifest.json Reference" },
          { slug: "engine-contract", title: "Engine Contract & Hooks" },
          { slug: "behavior-metadata", title: "Behavior Metadata" },
          { slug: "compatibility", title: "Compatibility & Versioning", flag: "soon" },
          { slug: "plugin-context", title: "Plugin Context Contract", flag: "soon" },
          { slug: "standalone-repos", title: "Portable Core & Standalone Repos", flag: "soon" },
          { slug: "dev-mode", title: "Studio Dev Mode Preview", flag: "soon" },
          { slug: "install-import", title: "Installing & Updating Engines", flag: "soon" },
          { slug: "template", title: "Using the Template" },
          { slug: "testing", title: "Testing Your Plugin" },
          { slug: "submission", title: "Submission Guidelines" }
        ]},
        { dir: "api", title: "TTS Gateway API", pages: [
          { slug: "overview", title: "Gateway Overview & Enabling" },
          { slug: "auth", title: "Authentication & Rate Limiting" },
          { slug: "endpoints", title: "Endpoints Reference" },
          { slug: "sync-vs-queued", title: "Inline vs Queued + Polling" },
          { slug: "priority", title: "Priority Policies" },
          { slug: "examples", title: "Examples" },
          { slug: "llm-controllers", title: "LLM / Controller Readiness", flag: "future" }
        ]},
        { dir: "architecture", title: "Architecture", pages: [
          { slug: "overview", title: "Architecture Overview" },
          { slug: "tts-server", title: "TTS Server & Watchdog" },
          { slug: "voice-bridge", title: "VoiceBridge" },
          { slug: "orchestration", title: "Task Orchestration" },
          { slug: "progress", title: "Progress Services" },
          { slug: "boot", title: "Boot Sequence" },
          { slug: "state", title: "State: state.json + SQLite" },
          { slug: "web-api", title: "Web & API Layer" },
          { slug: "paths-security", title: "Paths & Security" },
          { slug: "frontend", title: "Frontend Architecture" },
          { slug: "internal-api", title: "Internal HTTP API Reference" }
        ]},
        { dir: "operations", title: "Operations & Configuration", pages: [
          { slug: "launcher-options", title: "Launcher Options" },
          { slug: "env-vars", title: "Environment Variables" },
          { slug: "storage-layout", title: "Storage Layout" },
          { slug: "xtts-env", title: "The XTTS Environment" },
          { slug: "scripts", title: "Maintenance Scripts" },
          { slug: "backups-recovery", title: "Backups & Recovery" },
          { slug: "headless-lan", title: "Headless & LAN Exposure" },
          { slug: "performance", title: "Performance & GPU Tuning" }
        ]},
        { dir: "contributing", title: "Contributing & Project Info", pages: [
          { slug: "workflow", title: "Contribution Workflow" },
          { slug: "agent-rules", title: "Repository Agent Rules" },
          { slug: "testing-verification", title: "Testing & Verification" },
          { slug: "security", title: "Security Policy" },
          { slug: "license", title: "License" }
        ]}
      ]
    }
  ]
};
