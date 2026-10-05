/**
 * SamplesSectionColdLoad.test.tsx
 *
 * Real-bug regression test. `SamplesSection.test.tsx` mocks
 * `useVariantActions` entirely, which hid a real crash: on a cold
 * full-page load at /voices/:id, `profiles` is genuinely empty for one
 * render (the speaker_profiles fetch hasn't resolved yet), so
 * `profiles[0]` is undefined -- and the unmocked hook read
 * `profile.preview_url`/`asset_base_url`/`name`/`speed` unconditionally,
 * crashing the whole page. Confirmed live: reproduces on a hard
 * navigate/reload, never on in-app client-side routing where the data is
 * already cached from a prior render.
 *
 * This file deliberately does NOT mock useVariantActions -- only the true
 * network/global-store boundary (playerBus) -- so it actually exercises the
 * fix (SamplesSection passing a stable EMPTY_PROFILE instead of `undefined`
 * to the hook).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/store/playerBus', () => ({
  usePlayerBus: vi.fn().mockReturnValue({ scope: null, playing: false, audioUrl: null }),
  loadAndPlay: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
}));

import { SamplesSection } from '@/pages/VoiceLab/components/SamplesSection';

describe('SamplesSection cold-load regression (real useVariantActions, not mocked)', () => {
  it('does not throw when profiles is empty on first render', () => {
    expect(() => {
      render(<SamplesSection profiles={[]} onRefresh={vi.fn()} />);
    }).not.toThrow();
    expect(screen.getByText(/No profile found/i)).toBeInTheDocument();
  });
});
