import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VoiceSettingsPanel } from '@/pages/Voices/components/VoiceSettingsPanel';
import type { TtsEngine } from '@/types';

const engineWithSettings: TtsEngine = {
    engine_id: 'xtts',
    display_name: 'XTTS',
    enabled: true,
    verified: true,
    settings_schema: {
        properties: {
            temperature: { type: 'number', title: 'Temperature', minimum: 0, maximum: 1, default: 0.5 },
        },
    },
    behavior: { synthesis_settings: ['temperature'] },
} as any;

const engineWithoutSettings: TtsEngine = {
    engine_id: 'voxtral',
    display_name: 'Voxtral',
    enabled: true,
    verified: true,
} as any;

describe('VoiceSettingsPanel', () => {
    it('renders the plugin-defined per-voice settings form when the engine exposes synthesis_settings', () => {
        render(
            <VoiceSettingsPanel
                engine="xtts"
                engines={[engineWithSettings]}
                settings={{ temperature: 0.5 }}
                onSettingsChange={vi.fn()}
                isSaving={false}
                onSave={vi.fn()}
            />
        );

        expect(screen.getByText('Temperature')).toBeInTheDocument();
        expect(screen.getByText(/XTTS/)).toBeInTheDocument();
    });

    it('shows an empty state when the assigned engine has no per-voice settings', () => {
        render(
            <VoiceSettingsPanel
                engine="voxtral"
                engines={[engineWithoutSettings]}
                settings={{}}
                onSettingsChange={vi.fn()}
                isSaving={false}
                onSave={vi.fn()}
            />
        );

        expect(screen.getByText(/does not expose any per-voice settings/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Save Voice Settings/i })).not.toBeInTheDocument();
    });

    it('calls onSave when "Save Voice Settings" is clicked', () => {
        const onSave = vi.fn();
        render(
            <VoiceSettingsPanel
                engine="xtts"
                engines={[engineWithSettings]}
                settings={{ temperature: 0.5 }}
                onSettingsChange={vi.fn()}
                isSaving={false}
                onSave={onSave}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Save Voice Settings/i }));
        expect(onSave).toHaveBeenCalled();
    });

    it('disables the save button while saving', () => {
        render(
            <VoiceSettingsPanel
                engine="xtts"
                engines={[engineWithSettings]}
                settings={{ temperature: 0.5 }}
                onSettingsChange={vi.fn()}
                isSaving={true}
                onSave={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled();
    });
});
