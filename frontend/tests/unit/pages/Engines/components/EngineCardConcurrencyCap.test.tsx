/**
 * EngineCardConcurrencyCap.test.tsx
 *
 * Task 012 — per-engine concurrency cap override. Before this task,
 * `tts_engine_caps` was fully wired server-side (resolve_effective_cap,
 * app/orchestration/scheduler/cap_settings.py) but had zero frontend
 * consumer. This control lets the user override an engine's concurrency
 * cap, clamped client-side to that engine's manifest ceiling
 * (behavior.max_concurrent_workers), and saves via a raw JSON POST to
 * /api/settings (tts_engine_caps is only parsed from the JSON-body branch
 * server-side, same as tts_parallel_cap).
 *
 * Mocks: fetch (external network) and the api module (external module) only.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EngineCard } from '@/pages/Engines/components/EngineCard';
import type { TtsEngine } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchEngineScenarios: vi.fn(),
    updateEngineSettings: vi.fn(),
    clearEngineSetting: vi.fn(),
    testEngine: vi.fn(),
    verifyEngine: vi.fn(),
    installEngineDependencies: vi.fn(),
    fetchEngineRequirements: vi.fn().mockResolvedValue({ ok: true, requirements: [] }),
    removeEnginePlugin: vi.fn(),
    resetEngineCalibration: vi.fn(),
  },
}));

// `features` mirrors the real tts_xtts/manifest.json: XTTS declares
// `segment_orchestration` (Studio's chunk-group fan-out with resumable
// recovery — app/engines/behavior.py) alongside real, genuinely capped
// per-engine concurrency. A prior version of EngineCard.tsx hid the concurrency
// control for any engine with `segment_orchestration`, which was meant to gate
// on delegation-only orchestrators (Mixed) but silently hid the control for
// XTTS too, since its own manifest also carries that unrelated flag. The
// fixture below must include the real flag so this class of bug is caught.
const xttsEngine: TtsEngine = {
  engine_id: 'xtts',
  display_name: 'XTTS',
  status: 'ready',
  verified: true,
  enabled: true,
  version: '1.0.0',
  local: true,
  cloud: false,
  network: false,
  languages: ['en'],
  capabilities: ['tts'],
  resource: {},
  author: 'Studio',
  homepage: '',
  can_enable: true,
  settings_schema: { properties: {} },
  current_settings: {},
  behavior: { max_concurrent_workers: 4, features: ['segment_orchestration', 'mixed_rendering'] },
} as TtsEngine;

// Mirrors the real tts_mixed/manifest.json: a genuine delegation-only
// orchestrator that fans each segment to a real sub-engine, so a per-engine
// concurrency cap has no meaning for it.
const mixedEngine: TtsEngine = {
  ...xttsEngine,
  engine_id: 'mixed',
  display_name: 'Mixed Synthesis',
  behavior: { max_concurrent_workers: 1, features: ['segment_orchestration', 'delegation_only'] },
} as TtsEngine;

const openCard = (label: string = 'XTTS') => {
  fireEvent.click(screen.getByText(label));
};

describe('EngineCard concurrency cap override', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'ok', settings: {} }) }) as any;
  });

  it('shows the manifest ceiling as the visible limit', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} />);
    openCard();
    expect(screen.getByText(/up to 4 — engine limit/i)).toBeInTheDocument();
  });

  it('pre-fills the input from settings.tts_engine_caps for this engine', () => {
    render(
      <EngineCard
        engine={xttsEngine}
        onUpdate={vi.fn()}
        settings={{ safe_mode: false, default_engine: 'xtts', tts_engine_caps: { xtts: 3 } } as any}
      />
    );
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    expect(input.value).toBe('3');
  });

  it('saving posts a merged tts_engine_caps object to /api/settings, preserving other engines', async () => {
    const onUpdate = vi.fn();
    render(
      <EngineCard
        engine={xttsEngine}
        onUpdate={onUpdate}
        settings={{ safe_mode: false, default_engine: 'xtts', tts_engine_caps: { voxtral: 2 } } as any}
      />
    );
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ tts_engine_caps: { voxtral: 2, xtts: 4 } });
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });

  it('clamps a value above the manifest ceiling client-side before saving', async () => {
    render(
      <EngineCard
        engine={xttsEngine}
        onUpdate={vi.fn()}
        settings={{ safe_mode: false, default_engine: 'xtts', tts_engine_caps: {} } as any}
      />
    );
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ tts_engine_caps: { xtts: 4 } });
  });

  it('does not save when the field is cleared (blank input)', async () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} settings={{ safe_mode: false, default_engine: 'xtts', tts_engine_caps: { xtts: 2 } } as any} />);
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows the control for an engine declaring segment_orchestration but not delegation_only (XTTS)', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} />);
    openCard();
    expect(screen.getByLabelText('XTTS concurrent render cap')).toBeInTheDocument();
  });

  it('hides the control for a genuine delegation-only orchestrator (Mixed)', () => {
    render(<EngineCard engine={mixedEngine} onUpdate={vi.fn()} />);
    openCard('Mixed Synthesis');
    expect(screen.queryByLabelText('Mixed Synthesis concurrent render cap')).not.toBeInTheDocument();
  });

  it('describes the cap as taking effect immediately, not requiring a restart', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} />);
    openCard();
    expect(screen.getByText(/takes effect immediately, no restart needed/i)).toBeInTheDocument();
    expect(screen.queryByText(/takes effect on next app restart/i)).not.toBeInTheDocument();
  });
});
