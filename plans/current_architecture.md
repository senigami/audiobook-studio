# Current Architecture Mapping: Audiobook Studio

This document maps out the current structure of the Audiobook Studio application to identify major components, their responsibilities, and architectural bottlenecks. It serves as the baseline for the 2.0 redesign proposals.

## 1. System Overview

Audiobook Studio is a web-based application designed for high-quality audiobook production using local (XTTS) and cloud (Voxtral) text-to-speech engines. It follows a classic Client-Server architecture with a React frontend and a FastAPI (FastAPI router based) backend.

## 2. Backend Components (The "Engine Room")

### 2.1 Job & Queuing System (`app/jobs/`)
- **`worker.py`**: The central execution loop. It pulls job IDs from memory-based queues and branches logic based on the `engine` type.
- **`core.py`**: Defines the global `job_queue` (standard tasks) and `assembly_queue` (book generation) using Python's `queue.Queue`.
- **`handlers/`**: Contains specific logic for different job types:
    - `xtts.py`: Local GPU-accelerated synthesis.
    - `voxtral.py`: Cloud-based synthesis.
    - `mixed.py`: Handles chapters with multiple engines.
    - `audiobook.py`: Handles final M4B assembly.
- **Bottlenecks**:
    - **Tight Coupling**: The main worker loop contains hardcoded logic for estimating ETA, initializing resume state, and handling engine-specific branching.
    - **Concurrency Limits**: The current architecture is primarily focused on a single worker thread per queue, making it hard to scale horizontally across multiple instances or GPUs.
    - **Progress Logic Duplication**: Progress prediction and calculation are scattered between `worker.py`, `core.py`, and the handlers.

### 2.2 Voice & Synthesis Engines (`app/engines.py`, `app/xtts_inference.py`, `app/engines_voxtral.py`)
- **XTTS Integration**: Runs as a separate process via `app/xtts_inference.py` to maintain environmental isolation for CUDA/PyTorch dependencies.
- **Voxtral Integration**: Direct cloud API calls.
- **Bottlenecks**:
    - **No Unified API**: Each engine has a slightly different function signature. Adding new modules requires modifying multiple files in the `app/` and `app/jobs/` directories.
    - **Manual State Management**: Path resolution for speaker latents, samples, and results varies by engine, leading to repetitive "check if exists" logic.

### 2.3 State & Data Persistence
- **Memory State (`app/state.py`)**: Stores the active job registry, performance metrics (like XTTS characters-per-second), and global settings.
- **Persistence Layer (`app/db/`)**: SQLite is the primary source of truth for projects, library voices, and segment status.
- **Bottlenecks**:
    - **Synchronization Complexity**: Syncing the memory-based job objects with the SQLite-based queue state is a complex mechanism (managed partially in `reconcile.py` and `worker.py`) that can lead to inconsistencies during unexpected restarts.

### 2.4 Text Operations (`app/textops.py`)
- Handles text sanitization, chapter splitting, and character count management. This is a robust but largely independent module that could be moved into a utility service.

## 3. Frontend Components (The "Studio")

### 3.1 Layout & Navigation
- **`App.tsx`**: Manages global routing and top-level layout.
- **`Layout.tsx`**: Provides the structural frame, including the Global Queue visibility.

### 3.2 Feature Modules
- **`ProjectLibrary.tsx`**: High-level project management.
- **`ChapterEditor.tsx`**: The primary workspace for editing text and assigning voices. This is one of the most complex components, handling real-time segment-level status.
- **`VoicesTab.tsx`**: Interface for creating and managing different speaker profiles.

### 3.3 Progress Visualization
- **`PredictiveProgressBar.tsx`**: A sophisticated component that interpolates progress during "Preparing" vs "Running" states to ensure a smooth user experience even when backend updates are delayed.

## 4. Architectural Bottlenecks & Opportunities for 2.0

1.  **Modular Engine Registry**: Instead of hardcoded `if engine == "xtts"`, move to a plugin-style registry where engines wrap their specific needs into a common `AudiobookEngine` interface.
2.  **Standalone Queuing Module**: Decouple the worker logic from the specific task types. A generic `TaskQueue` should handle callbacks, retries, and persistence, unaware of whether it's generating audio or combining chapters.
3.  **Unified Progress/ETA Service**: Centralize the math for ETA predictions, resumption mapping, and progress broadcasting into a shared service used by both the backend and frontend.
4.  **Library vs. Project Schema**: Better distinguish between "Library" assets (reusable voice profiles) and "Project" specific data (temporary audio chunks, project-specific character assignments).
