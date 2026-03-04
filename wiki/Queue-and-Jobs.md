# Queue and Jobs

Audiobook Studio processes audio in the background so you can keep working.

## 🚦 Monitoring the Queue

The **Global Queue** is usually visible on the right sidebar or via a dedicated icon.

- **Queued**: Tasks waiting for their turn.
- **Running**: The current task being processed by the AI engine. You will see a predictive progress bar here.
- **Done/Failed**: History of recent work.

![Global Queue sidebar showing job progress and ETA](images/queue-sidebar.jpg)

## 📊 Performance Metrics

The system tracks **Characters Per Second (CPS)** and uses it to provide:

- **ETA**: Estimated time remaining for the current job.
- **Predicted Length**: How long the final audio chapter will likely be based on character count.

## 🛠️ Job Types

- **XTTS Generation**: Creating audio for a segment.
- **Baking**: Stitching segments into a chapter file.
- **Assembly**: Creating the final `.m4b` file.

## ⏸️ Pausing and Controls

- **Global Pause**: You can pause the entire queue if you need to free up system resources.
- **Cancel**: Stop a specific job. If it's the 'Running' job, it may take a few seconds to terminate the subprocess.

---

[[Home]] | [[Troubleshooting and FAQ]] | [[File Formats and Audio Guidance]]
