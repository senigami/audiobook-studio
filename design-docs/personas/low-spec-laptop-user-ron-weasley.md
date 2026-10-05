# 37 · Low-Spec Laptop User  ☆ INFERRED

**Identity:** "A novelist on aging hardware who chose local-first specifically to avoid subscription costs, and needs the UI to stay usable even when his machine is already under load."

## Goals
- Run long render jobs on a 2013 MacBook with 8 GB RAM and no GPU without freezing the browser
- Monitor a multi-hour render without the app consuming additional CPU in the foreground
- Keep the UI functional during peak render load — able to read segment text, check queue status, and navigate between chapters
- Avoid losing render progress if the browser tab becomes inactive or is closed and reopened
- Complete a full novel-length manuscript without running out of disk space unexpectedly

## Context & environment *(INFERRED)*
- 2013 MacBook Pro, 8 GB RAM, spinning or older SSD, Intel integrated graphics, macOS Ventura or earlier
- Uses Safari or Firefox; Chrome is too memory-heavy on his machine
- Chose Audiobook Studio over cloud services strictly for cost; would switch if local hardware becomes a blocker
- Works on novels of 60,000–90,000 words; chapters of 2,000–5,000 words each
- Has no GPU, so XTTS render is CPU-only and slow — a chapter can take 20–30 minutes; full book is an overnight job

## Key workflow moments
- **Render start:** Queues a full book render before bed; expects the app to continue running unattended without requiring the browser tab to stay in focus
- **Progress check:** Wakes up and checks render status; expects a clear current-state summary without refreshing or waiting for animation to complete
- **Foreground use during render:** While a render runs, browses other chapters to review text; expects navigation to be responsive even under background CPU load
- **Error recovery:** A render fails mid-book at 3 AM; expects the app to show exactly which segment failed and offer re-render from that point, not restart from scratch
- **Disk monitoring:** Expects visible disk-usage feedback before and during a large render so he doesn't run out of space on a 256 GB drive

## Top friction points *(INFERRED)*
- **F1 — CSS animations run unconditionally:** Framer Motion transitions and loading spinners run regardless of system load. On the Low-Spec Laptop User's machine, these consume measurable CPU and cause fan spin-up during renders. There is no reduced-motion or lite-mode option.
- **F2 — Large chapter editor loads entire segment list eagerly:** Opening a 5,000-word chapter loads all segment rows with full preview state. On low RAM, this causes the browser tab to stall for several seconds before the editor is interactive.
- **F3 — Queue panel requires active tab to reflect progress:** If the Low-Spec Laptop User navigates to another part of the app or puts the browser in the background, progress updates may lag or stall, leaving him uncertain whether the job is still running.
- **F4 — No disk-space warning before large renders:** The app starts a render without checking available disk space. the Low-Spec Laptop User has had a render fail halfway through with a cryptic write error after filling the drive.
- **F5 — No resume from mid-job failure:** When a render fails at segment 47 of 120, restarting the job re-renders from segment 1, wasting an hour of CPU time.

## What they need from the studio
- Respect `prefers-reduced-motion` and suppress non-essential animations automatically on that signal
- Virtualized or paginated segment list in the chapter editor — don't load all rows into the DOM at once
- Render progress persisted to the backend and recoverable on page reload, not dependent on an open browser tab
- Pre-render disk-space check with a plain-language warning if available space is below estimated output size
- Segment-level render checkpointing: restart a failed job from the last successful segment, not from the beginning

## Review lens — questions they ask of any screen
- "Will this screen load fast if my machine is already at 80% CPU?"
- "Can I navigate away from this tab without losing render progress?"
- "If I come back tomorrow morning, will the app show me exactly what finished and what failed?"
- "Does this page load all content at once, or does it load incrementally?"
- "How much disk space will this render use, and how much do I have left?"
- "If this fails overnight, can I resume where it stopped?"
- "Are there any animations on this screen I can't turn off?"

## Red flags that make them quit or distrust the app
- The browser tab becomes unresponsive when he opens a large chapter while a render is running
- A completed render is not visible after a browser restart — there is no persistent job log
- The app requires the tab to be open and focused for progress to update
- A disk-full error produces no human-readable explanation — just a failed job with a generic error
- Animations continue at full speed even with system reduced-motion preference set

**Evidence basis:** INFERRED. Interview writers and hobbyist audiobook producers using pre-2017 hardware or machines with 8 GB RAM to validate whether tab-persistence or animation overhead is the primary blocker, and to measure realistic render times on CPU-only XTTS to calibrate disk-space estimates.
