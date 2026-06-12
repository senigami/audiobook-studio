# Troubleshooting and FAQ

Common issues and how to resolve them.

## ❓ Frequently Asked Questions

### 1. Why did my job fail?

Check the **Logs** in the Queue sidebar. Common reasons include:

- Audio engine subprocess crashed (try restarting the app).
- Segment exceeded character limit (re-analyze the text).
- Disk space is full.

### 2. Why does the voice sound robotic?

- Ensure your samples are clean and have no background noise.
- Check if you recorded too close or too far from the mic.
- Try a different set of samples and regenerate the preview.

### 3. Why is Voxtral missing from the UI?

- Voxtral stays hidden unless you add a Mistral API key in Settings.
- You can keep the key saved and still toggle Voxtral off if you want a cleaner local-only interface.
- If you want a fully local workflow, stay on `XTTS (Local)`.

### 4. How do I fix "Long Sentence" warnings?

- Open the chapter in the **Chapter Editor** and switch to the **Script** view.
- Look for segments highlighted in yellow or red.
- Manually split the segment into two smaller ones using the editor.

## 🛠️ Common Workflows

### How to Retry a Failed Job

1. Open the **Queue** sidebar.
2. Find the failed job (highlighted in red).
3. Click the **Requeue** icon (circular arrow).

### How to Manually Rebuild a Voice

1. Go to the **AI Voice Lab** (Voices tab).
2. Click **Manage Samples** on the profile.
3. Add/Remove samples as needed.
4. Click the **Rebuild** or **Regenerate Sample** action that appears for that profile.

### How to Enable Voxtral

1. Open **Settings** and go to the **TTS Engines** tab.
2. Expand the **Voxtral** engine card.
3. Enter your Mistral API key in the engine form and enable the plugin.
4. Create or edit a voice profile and switch its engine to `Voxtral (Cloud)`.

---

[[Home]] | [[Queue and Jobs]] | [[Voices and Voice Profiles]]
