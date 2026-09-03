// WIRE-2 tests: EnginesPage exposes the Module Settings tab which renders
// per-engine JsonSchemaForm settings via VoiceModulesPanel.
// Mock boundary: api at the module level (R2 — only mock what's outside the units
// under test: the network/api layer).

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { api } from '@/api';
import { EnginesPage } from '@/pages/Engines/EnginesPage';

vi.mock('@/api', () => ({
    api: {
        fetchEngines: vi.fn(),
        refreshPlugins: vi.fn(),
        previewEnginePlugin: vi.fn(),
        confirmEnginePlugin: vi.fn(),
        cancelEnginePluginStaging: vi.fn(),
        fetchEngineLogs: vi.fn(),
        fetchHome: vi.fn().mockResolvedValue({ version: '2.0.0', runtime_services: [] }),
        restartTtsServer: vi.fn(),
        updateEngineSettings: vi.fn().mockResolvedValue({ ok: true }),
        clearEngineSetting: vi.fn().mockResolvedValue({ ok: true }),
    },
}));

const MOCK_ENGINE_WITH_SETTINGS = {
    engine_id: 'xtts-local',
    display_name: 'XTTS Local',
    status: 'ready',
    verified: true,
    enabled: true,
    version: '1.2.3',
    local: true,
    cloud: false,
    network: false,
    languages: ['en'],
    capabilities: ['preview'],
    resource: { gpu: false, vram_mb: 0, cpu_heavy: true },
    author: 'Studio',
    homepage: 'https://example.com',
    can_enable: true,
    settings_schema: {
        properties: {
            temperature: {
                type: 'number',
                title: 'Temperature',
                minimum: 0,
                maximum: 1,
                default: 0.7,
                description: 'Sampling temperature',
            },
        },
    },
    current_settings: { temperature: 0.7 },
} as any;

describe('EnginesPage — Module Settings tab (WIRE-2)', () => {
    it('switches to the Module Settings tab and renders the plugin schema settings', async () => {
        vi.mocked(api.fetchEngines).mockResolvedValue([MOCK_ENGINE_WITH_SETTINGS]);

        render(<EnginesPage startupReady={true} onRefresh={vi.fn()} onShowNotification={vi.fn()} />);

        fireEvent.click(screen.getByRole('tab', { name: 'Module Settings' }));

        await waitFor(() => {
            // The engine name appears as a section header in VoiceModulesPanel
            expect(screen.getByText('XTTS Local')).toBeInTheDocument();
            // The schema-driven setting title is rendered by JsonSchemaForm
            expect(screen.getByText('Temperature')).toBeInTheDocument();
        });
    });

    it('returns to the Engines tab when clicked again', async () => {
        vi.mocked(api.fetchEngines).mockResolvedValue([MOCK_ENGINE_WITH_SETTINGS]);

        render(<EnginesPage startupReady={true} onRefresh={vi.fn()} onShowNotification={vi.fn()} />);

        fireEvent.click(screen.getByRole('tab', { name: 'Module Settings' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Engines' }));

        await waitFor(() => {
            // ServerDiagnostics is rendered on the Engines tab
            expect(screen.getByRole('heading', { name: 'Engines' })).toBeInTheDocument();
        });
    });
});
