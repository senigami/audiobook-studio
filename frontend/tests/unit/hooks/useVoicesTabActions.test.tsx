import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVoicesTabActions } from '@/hooks/useVoicesTabActions';

describe('useVoicesTabActions', () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buildState = (overrides: Record<string, any> = {}) => ({
    editingProfile: {
      name: 'SpeakerA',
      speaker_id: null,
      variant_name: 'Default',
      engine: 'xtts',
    },
    testText: 'Preview text',
    variantName: 'Default',
    editingEngine: 'xtts',
    referenceSample: '',
    engineVoiceId: '',
    editingSettings: {},
    setIsSavingText: vi.fn(),
    setEditingProfile: vi.fn(),
    setTestText: vi.fn(),
    setVariantName: vi.fn(),
    setEditingEngine: vi.fn(),
    setReferenceSample: vi.fn(),
    setEngineVoiceId: vi.fn(),
    ...overrides,
  });

  const buildManagement = () => ({
    fetchSpeakers: vi.fn(),
    handleUpdateEngine: vi.fn(),
    handleUpdateSettings: vi.fn().mockResolvedValue(true),
    formatError: vi.fn(),
    speakers: [],
  });

  it('saves only plugin settings allowed for the current engine', async () => {
    const state = buildState({
      editingSettings: {
        temperature: 0.75,
        test_text: 'stale test text',
        engine: 'stale-engine',
        variant_name: 'Ignored',
        built_samples: ['ignore-me'],
      },
    });
    const management = buildManagement();
    const engines = [
      {
        engine_id: 'xtts',
        display_name: 'XTTS',
        enabled: true,
        status: 'ready',
        cloud: false,
        capabilities: [],
        behavior: { synthesis_settings: ['temperature'] },
      } as any,
    ];

    const actions = useVoicesTabActions({
      state,
      management,
      onRefresh,
      engines,
      allVoices: [],
    });

    await actions.handleSaveTestText();

    expect(management.handleUpdateSettings).toHaveBeenCalledTimes(1);
    expect(management.handleUpdateSettings).toHaveBeenCalledWith(
      'SpeakerA',
      expect.objectContaining({
        engine: 'xtts',
        test_text: 'Preview text',
        temperature: 0.75,
      })
    );

    const payload = (management.handleUpdateSettings as any).mock.calls[0][1];
    expect(payload).not.toHaveProperty('variant_name');
    expect(payload).not.toHaveProperty('built_samples');
    expect(payload).not.toHaveProperty('speaker_id');
    expect(state.setEditingProfile).toHaveBeenCalledWith(null);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('drops stale plugin settings when the drawer engine changes', async () => {
    const state = buildState({
      editingEngine: 'voxtral',
      editingSettings: {
        temperature: 0.75,
        model: 'voxtral-1',
      },
    });
    const management = buildManagement();
    const engines = [
      {
        engine_id: 'voxtral',
        display_name: 'Voxtral',
        enabled: true,
        status: 'ready',
        cloud: true,
        capabilities: ['voice_asset_id'],
        behavior: { synthesis_settings: ['model'] },
      } as any,
    ];

    const actions = useVoicesTabActions({
      state,
      management,
      onRefresh,
      engines,
      allVoices: [],
    });

    await actions.handleSaveTestText();

    const payload = (management.handleUpdateSettings as any).mock.calls[0][1];
    expect(payload).toEqual(expect.objectContaining({
      engine: 'voxtral',
      test_text: 'Preview text',
      model: 'voxtral-1',
    }));
    expect(payload).not.toHaveProperty('temperature');
  });
});
