/**
 * EngineCardConcurrencyCap.test.tsx
 *
 * Task 012 — per-engine concurrency cap override. Before this task,
 * `tts_engine_caps` was fully wired server-side (resolve_effective_cap,
 * app/orchestration/scheduler/cap_settings.py) but had zero frontend
 * consumer. This control lets the user override an engine's concurrency
 * cap, clamped client-side to that engine's manifest ceiling
 * (behavior.max_concurrent_workers), and saves via a raw JSON POST to
 * the single-key PUT (api.saveEngineCap), which merges one engine's override
 * server-side.
 *
 * Mocks: fetch (external network) and the api module (external module) only.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EngineCard } from '@/pages/Engines/components/EngineCard';
import type { TtsEngine } from '@/types';
import { api } from '@/api';
import { ParallelCapRefusedError } from '@/api/capRefusal';
import { refusalFixture, refusalResponse } from '../../../../helpers/capSafetyFixtures';

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
    saveEngineCap: vi.fn(),
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
    (api.saveEngineCap as any).mockReset();
    (api.saveEngineCap as any).mockResolvedValue({});
  });

  it('shows the manifest ceiling as the visible limit', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} />);
    openCard();
    expect(
      screen.getByText('How many segments this engine may render at once, up to 4. Changes apply right away, no restart needed.')
    ).toBeInTheDocument();
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

  it('saving calls the single-key PUT save with the engine id and value', async () => {
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

    await waitFor(() => expect(api.saveEngineCap).toHaveBeenCalledWith('xtts', 4));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalled();
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

    await waitFor(() => expect(api.saveEngineCap).toHaveBeenCalledWith('xtts', 4));
  });

  it('lets a typed value above the hard limit reach the server so a refusal can explain it', async () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} settings={{ tts_engine_caps: {} } as any} />);
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    await waitFor(() => expect(api.saveEngineCap).toHaveBeenCalledWith('xtts', 4));
  });

  it('lowers the visible limit and the stepper max to the hard limit, not the comfortable number', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} settings={{ tts_engine_caps: { xtts: 2 } } as any} />);
    openCard();
    expect(
      screen.getByText('How many segments this engine may render at once, up to 2. Changes apply right away, no restart needed.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Increase XTTS concurrent render cap')).toBeDisabled();
  });

  it('shows the hint and links it to the stepper', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} />);
    openCard();
    expect(screen.getByLabelText('XTTS concurrent render cap')).toHaveAttribute('aria-describedby', 'engine-cap-hint-xtts');
    expect(document.getElementById('engine-cap-hint-xtts')).toHaveTextContent(
      'This computer can comfortably render one at a time right now, and can go as high as 2. Closing other apps may allow more.'
    );
  });

  it('shows a polite warning, linked to the stepper, while the value is above the comfortable number', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} settings={{ tts_engine_caps: { xtts: 2 } } as any} />);
    openCard();
    const warning = screen.getByRole('status');
    expect(warning.id).toBe('engine-cap-warning-xtts');
    expect(warning).toHaveTextContent(
      'Above 1, Studio uses memory it normally keeps free, so your computer may feel slow while rendering.'
    );
    expect(screen.getByLabelText('XTTS concurrent render cap')).toHaveAttribute(
      'aria-describedby',
      'engine-cap-hint-xtts engine-cap-warning-xtts'
    );
  });

  it('warns on the inherited value when there is no override', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} effectiveCap={2} settings={{ tts_engine_caps: {} } as any} />);
    openCard();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows no warning when the inherited value is at the comfortable number', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} effectiveCap={1} settings={{ tts_engine_caps: {} } as any} />);
    openCard();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('judges an override, not the inherited value, when one is set', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} effectiveCap={2} settings={{ tts_engine_caps: { xtts: 1 } } as any} />);
    openCard();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows no warning at the comfortable number', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} settings={{ tts_engine_caps: { xtts: 1 } } as any} />);
    openCard();
    expect(screen.queryByRole('status')).toBeNull();
  });

  describe('inherit line while the override is empty', () => {
    const inheritText = (n: number) =>
      `Left empty, this engine uses the Parallel Segment Rendering setting, which is ${n} right now.`;

    it('shows the effective number, linked first in aria-describedby, and never live', () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} effectiveCap={2} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      const line = document.getElementById('engine-cap-inherit-xtts');
      expect(line).toHaveTextContent(inheritText(2));
      expect(line).not.toHaveAttribute('role');
      expect(line?.closest('[aria-live]')).toBeNull();
      expect(screen.getByLabelText('XTTS concurrent render cap')).toHaveAttribute(
        'aria-describedby',
        'engine-cap-inherit-xtts engine-cap-hint-xtts engine-cap-warning-xtts'
      );
      expect(screen.getByRole('status').id).toBe('engine-cap-warning-xtts');
    });

    it('shows the effective number even when it is not the saved global setting', () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} effectiveCap={3} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      expect(document.getElementById('engine-cap-inherit-xtts')).toHaveTextContent(inheritText(3));
    });

    it('is shown without a warning when the effective number is comfortable', () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={2} hardMax={4} effectiveCap={2} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      expect(document.getElementById('engine-cap-inherit-xtts')).toHaveTextContent(inheritText(2));
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('is hidden before the first answer', () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      expect(document.getElementById('engine-cap-inherit-xtts')).toBeNull();
    });

    it('is absent when an override exists', () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} safeMax={1} hardMax={2} effectiveCap={2} settings={{ tts_engine_caps: { xtts: 1 } } as any} />);
      openCard();
      expect(document.getElementById('engine-cap-inherit-xtts')).toBeNull();
      expect(screen.getByLabelText('XTTS concurrent render cap')).toHaveAttribute('aria-describedby', 'engine-cap-hint-xtts');
    });

    it('goes away when a value is typed and returns when the field is cleared', () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} effectiveCap={2} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '3' } });
      expect(document.getElementById('engine-cap-inherit-xtts')).toBeNull();
      fireEvent.change(input, { target: { value: '' } });
      expect(document.getElementById('engine-cap-inherit-xtts')).toHaveTextContent(inheritText(2));
    });

    it('steps up from the effective number, not from 1', async () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} effectiveCap={3} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      fireEvent.click(screen.getByLabelText('Increase XTTS concurrent render cap'));
      await waitFor(() => expect(api.saveEngineCap).toHaveBeenCalledWith('xtts', 4));
    });

    it('steps down from the effective number', async () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} effectiveCap={3} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      fireEvent.click(screen.getByLabelText('Decrease XTTS concurrent render cap'));
      await waitFor(() => expect(api.saveEngineCap).toHaveBeenCalledWith('xtts', 2));
    });
  });

  it('shows no hint before the first answer', () => {
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} />);
    openCard();
    expect(document.getElementById('engine-cap-hint-xtts')).toBeNull();
    expect(screen.getByLabelText('XTTS concurrent render cap')).not.toHaveAttribute('aria-describedby');
  });

  it('shows a refusal inline, snaps the field back to the stored value, and shows no toast', async () => {
    (api.saveEngineCap as any).mockRejectedValue(new ParallelCapRefusedError(refusalFixture()));
    const onShowNotification = vi.fn();
    const onLimitsRefresh = vi.fn();
    render(
      <EngineCard
        engine={xttsEngine}
        onUpdate={vi.fn()}
        onShowNotification={onShowNotification}
        onLimitsRefresh={onLimitsRefresh}
        settings={{ tts_engine_caps: { xtts: 2 } } as any}
      />
    );
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server sentence for tests, safe maximum 1.');
    expect(alert.id).toBe('engine-cap-error-xtts');
    expect(input.value).toBe('2');
    expect(input).toHaveAttribute('aria-describedby', 'engine-cap-error-xtts');
    expect(onLimitsRefresh).toHaveBeenCalled();
    expect(onShowNotification).not.toHaveBeenCalled();
  });

  it('snaps back to empty when a refused save had no stored override', async () => {
    (api.saveEngineCap as any).mockRejectedValue(new ParallelCapRefusedError(refusalFixture()));
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} settings={{ tts_engine_caps: {} } as any} />);
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    await screen.findByRole('alert');
    expect(input.value).toBe('');
  });

  it('clears the refusal when the person edits the value again', async () => {
    (api.saveEngineCap as any).mockRejectedValue(new ParallelCapRefusedError(refusalFixture()));
    render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} settings={{ tts_engine_caps: {} } as any} />);
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);
    await screen.findByRole('alert');

    fireEvent.change(input, { target: { value: '3' } });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the generic toast, with no inline message, for any other failure', async () => {
    (api.saveEngineCap as any).mockRejectedValue(new Error('network down'));
    const onShowNotification = vi.fn();
    render(
      <EngineCard engine={xttsEngine} onUpdate={vi.fn()} onShowNotification={onShowNotification} settings={{ tts_engine_caps: { xtts: 2 } } as any} />
    );
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    await waitFor(() => expect(onShowNotification).toHaveBeenCalledWith('Settings update failed. Please try again.'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.value).toBe('2');
  });

  it('a real 422 refusal through the actual save call shows the alert and snaps back (response.ok is honoured)', async () => {
    const actual = await vi.importActual<typeof import('@/api')>('@/api');
    (api.saveEngineCap as any).mockImplementation((...args: [string, number | null]) => actual.api.saveEngineCap(...args));
    global.fetch = vi.fn().mockResolvedValue(refusalResponse(refusalFixture())) as any;
    const onShowNotification = vi.fn();
    render(
      <EngineCard engine={xttsEngine} onUpdate={vi.fn()} onShowNotification={onShowNotification} settings={{ tts_engine_caps: { xtts: 2 } } as any} />
    );
    openCard();
    const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    expect(await screen.findByRole('alert')).toHaveTextContent('Server sentence for tests, safe maximum 1.');
    expect(input.value).toBe('2');
    expect(onShowNotification).not.toHaveBeenCalled();
  });

  describe('clearing the field', () => {
    const withOverride = { tts_engine_caps: { xtts: 2 } } as any;
    const clearAndBlur = () => {
      const input = screen.getByLabelText('XTTS concurrent render cap') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);
      return input;
    };

    it('clears a saved override with a null save, once, then refreshes', async () => {
      const onUpdate = vi.fn();
      const onLimitsRefresh = vi.fn();
      render(<EngineCard engine={xttsEngine} onUpdate={onUpdate} onLimitsRefresh={onLimitsRefresh} settings={withOverride} />);
      openCard();
      clearAndBlur();

      await waitFor(() => expect(api.saveEngineCap).toHaveBeenCalledWith('xtts', null));
      expect(api.saveEngineCap).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(onUpdate).toHaveBeenCalled());
      expect(onLimitsRefresh).toHaveBeenCalled();
    });

    it('sends nothing when there is no saved override', async () => {
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} settings={{ tts_engine_caps: {} } as any} />);
      openCard();
      clearAndBlur();

      expect(api.saveEngineCap).not.toHaveBeenCalled();
    });

    it('shows the refusal and restores the override when the server refuses the clear', async () => {
      (api.saveEngineCap as any).mockRejectedValue(new ParallelCapRefusedError(refusalFixture()));
      const onShowNotification = vi.fn();
      render(<EngineCard engine={xttsEngine} onUpdate={vi.fn()} onShowNotification={onShowNotification} settings={withOverride} />);
      openCard();
      const input = clearAndBlur();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Server sentence for tests, safe maximum 1.');
      expect(input.value).toBe('2');
      expect(onShowNotification).not.toHaveBeenCalled();
    });

    it('shows the inherited number once the clear is saved and the refreshed answer arrives', async () => {
      const onUpdate = vi.fn();
      const { rerender } = render(<EngineCard engine={xttsEngine} onUpdate={onUpdate} effectiveCap={2} settings={withOverride} />);
      openCard();
      const input = clearAndBlur();
      await waitFor(() => expect(onUpdate).toHaveBeenCalled());

      rerender(<EngineCard engine={xttsEngine} onUpdate={onUpdate} effectiveCap={3} settings={{ tts_engine_caps: {} } as any} />);
      expect(input.value).toBe('');
      expect(document.getElementById('engine-cap-inherit-xtts')).toHaveTextContent(
        'Left empty, this engine uses the Parallel Segment Rendering setting, which is 3 right now.'
      );
    });
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
    expect(screen.getByText(/changes apply right away, no restart needed/i)).toBeInTheDocument();
    expect(screen.queryByText(/takes effect on next app restart/i)).not.toBeInTheDocument();
  });
});
