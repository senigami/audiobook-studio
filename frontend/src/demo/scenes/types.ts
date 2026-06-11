/**
 * Demo Scene Engine — typed scene primitives.
 *
 * A DemoFrame carries the raw socket message that publishStudioSocketMessage
 * receives as its first argument (before wrapping into a StudioSocketEnvelope).
 * atMs is scene-relative (0 = start of this scene).
 */

export interface DemoFrame {
  atMs: number;
  data: any; // raw socket message — intentionally untyped at this layer
}

export interface DemoScene {
  id: string;
  title: string;
  caption: string;
  durationMs: number;
  frames: DemoFrame[];
}

export interface DemoTimeline {
  scenes: DemoScene[];
  totalMs: number;
}

/**
 * Validate and compile scenes into a timeline.
 * Validates:
 *   - frames within each scene are sorted ascending by atMs
 *   - no frame has atMs > scene.durationMs
 * atMs values are scene-relative; the transport handles sequencing.
 */
export const compileTimeline = (scenes: DemoScene[]): DemoTimeline => {
  for (const scene of scenes) {
    for (let i = 0; i < scene.frames.length; i++) {
      const frame = scene.frames[i];
      if (frame.atMs > scene.durationMs) {
        throw new Error(
          `Scene "${scene.id}": frame at index ${i} has atMs=${frame.atMs} > durationMs=${scene.durationMs}`,
        );
      }
      if (i > 0 && frame.atMs < scene.frames[i - 1].atMs) {
        throw new Error(
          `Scene "${scene.id}": frames are not sorted — frame[${i}].atMs=${frame.atMs} < frame[${i - 1}].atMs=${scene.frames[i - 1].atMs}`,
        );
      }
    }
  }

  const totalMs = scenes.reduce((sum, s) => sum + s.durationMs, 0);
  return { scenes, totalMs };
};
