# Troubleshooting and FAQ

Common issues and how to resolve them.

## Frequently Asked Questions

### 1. Why did my job fail?

Check the job row in the **Queue Drawer** (top bar button) or the **Activity** page (**MONITOR > Activity**). Common reasons include:

- Audio engine subprocess crashed (try restarting the app).
- Segment exceeded character limit (re-analyze the text in the Manuscript stage).
- Disk space is full.

### 2. Why does the voice sound robotic?

- Ensure your samples are clean and have no background noise.
- Check if you recorded too close or too far from the mic.
- Try a different set of samples and regenerate the preview in the Voice Lab.

### 3. Why is Voxtral missing from the UI?

- Voxtral stays hidden unless you add a Mistral API key under **PLATFORM > Engines**.
- You can keep the key saved and still toggle Voxtral off if you want a cleaner local-only interface.
- If you want a fully local workflow, stay on `XTTS (Local)`.

### 4. How do I fix "Long Sentence" warnings?

- Open the book and go to the **Manuscript** stage.
- Switch to the chapter with the warning and look for segments highlighted in yellow or red in the Script view.
- Manually split the segment into two smaller ones using the editor.

### 5. Where did the old Settings tabs for Engines and API go?

- Engine configuration moved to its own page: **PLATFORM > Engines** in the left rail.
- API / gateway documentation moved to: **PLATFORM > Integrations** in the left rail.
- The old URLs `/settings/engines` and `/settings/api` redirect automatically.

### 6. Where are the old project and chapter URLs?

- The old `/project/:id` and `/chapter/:id` URLs redirect to the new book pipeline at `/book/:id/manuscript` and the appropriate stage respectively. Old bookmarks still work.

## Common Workflows

### How to Retry a Failed Job

1. Open the **Queue Drawer** from the top bar button, or go to **MONITOR > Activity**.
2. Find the failed job (highlighted in red).
3. Click the **Requeue** icon (circular arrow).

### How to Manually Rebuild a Voice

1. Go to **CREATE > Voices** in the left rail.
2. Click the voice card to open the **Voice Lab**.
3. Add or remove samples as needed.
4. Click the **Rebuild** or **Regenerate Sample** action that appears for that profile.

### How to Enable Voxtral

1. Go to **PLATFORM > Engines** in the left rail.
2. Expand the **Voxtral** engine card.
3. Enter your Mistral API key in the engine form and enable the plugin.
4. Open the Voice Lab for a voice profile and switch its engine to `Voxtral (Cloud)`.

### How to Assign Narrator and Character Voices

1. Open a book from the Library.
2. Go to the **Casting** stage.
3. The first pinned row is the Narrator — assign a voice there as the fallback for any unassigned line.
4. Add character rows for dialogue voices as needed.

---

[[Home]] | [[Queue and Jobs]] | [[Voices and Voice Profiles]]
