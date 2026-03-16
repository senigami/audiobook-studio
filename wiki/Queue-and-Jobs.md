# Queue and Jobs

Audiobook Studio processes audio in the background so you can keep working.

## 🚦 Monitoring the Queue

The **Global Queue** is usually visible on the right sidebar or via a dedicated icon.

- **Queued**: Tasks waiting for their turn.
- **Running**: The current task being processed by the AI engine. You will see a predictive progress bar here.
- **Done/Failed**: History of recent work.

![Global Queue sidebar showing job progress and ETA](images/queue-sidebar.jpg)

## ↕️ Reordering Tasks

You can drag and drop items in the **Up Next** section to re-prioritize your work. The system will immediately synchronize the background worker to follow your new order as soon as the current job finishes.

## 📊 Performance Metrics

The system tracks **Characters Per Second (CPS)** and uses it to provide:

- **ETA**: Estimated time remaining for the current job. Now includes a **total queue estimate** at the top of the Global Queue page, summing up all pending and active work in minutes.
- **Predicted Length**: How long the final audio chapter will likely be based on character count.

### New Features & Fixes
- **Global Queue ETA**: Added an "Approx. X minutes remaining" badge to the processing queue header that tracks cumulative work across all active and queued tasks.
- **Reliable Queue Reordering**: Fixed a timestamp inversion bug and implemented in-memory synchronization, ensuring the background worker strictly follows the UI priority.
- **Enhanced Progress Visuals**: Smoothed progress transitions to 2s ease-in-out for a more fluid and premium interface experience.
- **Locked-in Test Suite**: Added 11 regression tests covering ETA calculations, database joins, and in-memory queue synchronization logic.

## 🛠️ Job Types

- **XTTS Generation**: Creating audio for a segment.
- **Baking**: Stitching segments into a chapter file.
- **Assembly**: Creating the final `.m4b` file.

## ⏸️ Pausing and Controls

- **Global Pause**: You can pause the entire queue if you need to free up system resources.
- **Cancel**: Stop a specific job. If it's the 'Running' job, it may take a few seconds to terminate the subprocess.

---

[[Home]] | [[Troubleshooting and FAQ]] | [[File Formats and Audio Guidance]]
