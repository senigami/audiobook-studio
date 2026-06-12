/**
 * voiceLabStage.test.tsx — fixture voices render with engine badges + statuses.
 *
 * Mocks useDemoTransport (required by DemoApp import chain) and
 * ActionMenu (uses Radix portals incompatible with jsdom) so the
 * NarratorCard header row renders cleanly.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// useDemoTransport is needed if DemoApp or DemoStage is imported; stub it so
// we can import the stage directly without an active transport.
vi.mock('@/demo/useDemoTransport', () => ({
  useDemoTransport: () => ({
    state: {
      playing: false,
      rate: 1,
      sceneIndex: 0,
      scene: { id: 's', title: 'S', caption: '', durationMs: 1000, frames: [] },
      scenePositionMs: 0,
      looping: false,
    },
    controls: { play: vi.fn(), pause: vi.fn(), restart: vi.fn(), setRate: vi.fn(), jumpToScene: vi.fn(), setLooping: vi.fn() },
  }),
}));

// ActionMenu uses Radix DropdownMenu which relies on portals — stub it so the
// card header renders without portal errors in jsdom.
vi.mock('@/components/ui/ActionMenu', () => ({
  ActionMenu: () => null,
}));

const { voiceLabStage } = await import('@/demo/stages/voiceLabStage');
const { demoVoices, demoVoiceEngines } = await import('@/demo/fixtures/voiceFixtures');

describe('voiceLabStage', () => {
  it('stage has expected id and title', () => {
    expect(voiceLabStage.id).toBe('voice-lab');
    expect(voiceLabStage.title).toBe('Voice Lab');
  });

  it('renders all four fixture voice names', () => {
    render(voiceLabStage.element);
    for (const { speaker } of demoVoices) {
      expect(screen.getByText(speaker.name)).toBeInTheDocument();
    }
  });

  it('renders READY status badge for Dark Fantasy', () => {
    render(voiceLabStage.element);
    // READY voices show a READY badge
    const readyBadges = screen.getAllByText('READY');
    expect(readyBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders BUILD TO TEST badge for Sea Captain', () => {
    render(voiceLabStage.element);
    expect(screen.getByText('BUILD TO TEST')).toBeInTheDocument();
  });

  it('renders engine badge label for xtts voices', () => {
    render(voiceLabStage.element);
    const xttsEngine = demoVoiceEngines.find(e => e.engine_id === 'xtts')!;
    // Engine badge uses display_name
    const badges = screen.getAllByText(xttsEngine.display_name);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Voxtral engine badge for Sea Captain', () => {
    render(voiceLabStage.element);
    const voxtralEngine = demoVoiceEngines.find(e => e.engine_id === 'voxtral')!;
    expect(screen.getByText(voxtralEngine.display_name)).toBeInTheDocument();
  });
});
