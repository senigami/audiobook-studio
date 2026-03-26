# Settings

Global configuration for Audiobook Studio.

## ⚙️ Application Settings

Access settings via the Sidebar menu.

- **Safe Mode**: Automatically attempts to recover the AI engine if it encounters an error.
- **Produce MP3**: Toggles generation of MP3 files alongside WAV for better compatibility.
- **Backfill MP3s**: Scans your library and generates missing MP3 files for existing chapters.

![Settings Tray popover showing synthesis preferences](images/settings-tray.jpg)

## 📁 Storage Locations

By default, the application stores data in the following folders:

- `/projects/`: Current primary storage for project text, audio, and assembled books.
- `/voices/`: Current voice models and profile metadata.
- `/chapters/`: Default loose chapter-text folder for fresh installs when you use legacy text-file flows.
- `/xtts_audio/`: Legacy/global audio output root kept for compatibility with older non-project workflows.
- `/audiobooks/`: Legacy/global assembled `.m4b` output root kept for compatibility.

---

[[Home]] | [[File Formats and Audio Guidance]]
