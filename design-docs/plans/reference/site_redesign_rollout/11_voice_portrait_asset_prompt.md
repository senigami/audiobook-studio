# Voice Portrait Asset Prompt

## Purpose

Reusable prompt recipe for voice profile artwork used in the Studio voice library, Voice Lab, shareable voice bundles, and Hugging Face profile/discovery surfaces.

## Output Contract

- Format: PNG raster image.
- Size: 1024 x 1024 px square.
- Background: one flat solid color filling the full square.
- Framing: centered bust portrait, shoulders-up, with enough padding for circular avatar cropping.
- Style: polished simple portrait, readable at small sizes, not busy.
- Exclusions: no text, watermark, logo, microphone, headphones, props, scenery, gradients, patterned background, or cast shadow.

## Prompt Template

```text
Use case: stylized-concept
Asset type: reusable voice avatar portrait for audiobook studio UI, exported voice bundles, and Hugging Face voice profile
Primary request: create a simple polished raster portrait image for a {voice_trait_summary} voice.
Style/medium: high-quality softly rendered digital portrait, Apple-quality clean UI asset, simple and premium, not photorealistic, not cartoonish.
Composition/framing: square 1024x1024 image, centered bust portrait from shoulders up, head and shoulders fully inside frame, generous padding so it can be cropped into a circular avatar without cutting off the head or shoulders.
Scene/backdrop: one perfectly solid flat background color, {background_color_name} background {background_hex}, no gradient, no texture, no shadows on the background.
Subject: {subject_description}. Keep the portrait readable at small sizes and suitable for a voice category avatar.
Lighting/mood: soft studio light, {mood_words}.
Constraints: solid background must fill the entire square; no text, no watermark, no logo, no microphone, no headphones, no props, no scenery; keep the portrait simple and reusable across voice cards and Hugging Face listings.
```

## Example Prompts

### Warm Narrator

```text
Primary request: create a simple polished raster portrait image for a warm adult female narrator voice.
Scene/backdrop: one perfectly solid flat background color, warm peach background #F0B27A, no gradient, no texture, no shadows on the background.
Subject: calm adult woman narrator, grayscale/charcoal clothing and hair with subtle warm highlights, friendly neutral expression, clean silhouette, minimal details that remain readable at small sizes.
Lighting/mood: soft studio light, refined and approachable.
```

### Gruff Character

```text
Primary request: create a simple polished raster portrait image for a gruff character voice.
Scene/backdrop: one perfectly solid flat background color, muted sage gray background #9AA38D, no gradient, no texture, no shadows on the background.
Subject: gruff ogre-like character silhouette, broad head and heavy brow, charcoal gray skin tones, simple tunic, readable strong shape, not scary or gory, suitable for a voice category avatar rather than a game monster.
Lighting/mood: soft studio light, sturdy, textured, characterful.
```

## Implementation Notes

- Store reusable raster samples under `frontend/public/demo-voice-raster/`.
- Store reusable vector fallback portraits under `frontend/public/demo-voice-silhouettes/`.
- If a generator returns a non-1024 square, crop/resize the project copy to 1024 x 1024 before use.
- If the background drifts into a gradient or texture, regenerate with stronger flat-background language or post-process before publishing to Hugging Face.
