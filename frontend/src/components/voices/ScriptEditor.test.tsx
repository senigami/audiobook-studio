import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScriptEditor } from './ScriptEditor';

describe('ScriptEditor', () => {
    it('renders and handles interactions', () => {
        const onVariantNameChange = vi.fn();
        const onTestTextChange = vi.fn();
        const onResetTestText = vi.fn();
        const onSave = vi.fn();

        render(
            <ScriptEditor 
                variantName="Test Variant"
                onVariantNameChange={onVariantNameChange}
                engine="xtts"
                onEngineChange={vi.fn()}
                engines={[]}
                testText="Sample script"
                onTestTextChange={onTestTextChange}
                referenceSample=""
                onReferenceSampleChange={vi.fn()}
                availableSamples={[]}
                voxtralVoiceId=""
                onVoxtralVoiceIdChange={vi.fn()}
                onResetTestText={onResetTestText}
                onSave={onSave}
                isSaving={false}
            />
        );

        expect(screen.getByDisplayValue('Test Variant')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Sample script')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText(/Variant name/i), { target: { value: 'New Name' } });
        expect(onVariantNameChange).toHaveBeenCalledWith('New Name');

        const textarea = screen.getByDisplayValue('Sample script');
        fireEvent.change(textarea, { target: { value: 'New script' } });
        expect(onTestTextChange).toHaveBeenCalledWith('New script');

        fireEvent.click(screen.getByText(/Reset to Default/i));
        expect(onResetTestText).toHaveBeenCalled();

        fireEvent.click(screen.getByText('Save Script'));
        expect(onSave).toHaveBeenCalled();
    });

    it('shows saving state', () => {
        render(
            <ScriptEditor 
                variantName=""
                onVariantNameChange={vi.fn()}
                engine="xtts"
                onEngineChange={vi.fn()}
                engines={[]}
                testText=""
                onTestTextChange={vi.fn()}
                referenceSample=""
                onReferenceSampleChange={vi.fn()}
                availableSamples={[]}
                voxtralVoiceId=""
                onVoxtralVoiceIdChange={vi.fn()}
                onResetTestText={vi.fn()}
                onSave={vi.fn()}
                isSaving={true}
            />
        );
        expect(screen.getByText(/Saving Changes/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Saving Changes/i })).toBeDisabled();
    });

    it('shows Voxtral metadata controls when engine is voxtral', () => {
        render(
            <ScriptEditor
                variantName="Voice"
                onVariantNameChange={vi.fn()}
                engine="voxtral"
                onEngineChange={vi.fn()}
                engines={[{ engine_id: 'voxtral', display_name: 'Voxtral', enabled: true, verified: true } as any]}
                testText="Preview"
                onTestTextChange={vi.fn()}
                referenceSample="sample1.wav"
                onReferenceSampleChange={vi.fn()}
                availableSamples={['sample1.wav']}
                voxtralVoiceId="voice-123"
                onVoxtralVoiceIdChange={vi.fn()}
                onResetTestText={vi.fn()}
                onSave={vi.fn()}
                isSaving={false}
            />
        );

        expect(screen.getByLabelText('Engine')).toHaveValue('voxtral');
        expect(screen.getByLabelText('Reference Sample')).toHaveValue('sample1.wav');
        expect(screen.getByDisplayValue('voice-123')).toBeInTheDocument();
    });

    it('hides Voxtral engine controls when cloud voices are disabled', () => {
        render(
            <ScriptEditor
                variantName="Voice"
                onVariantNameChange={vi.fn()}
                engine="xtts"
                onEngineChange={vi.fn()}
                engines={[]}
                testText="Preview"
                onTestTextChange={vi.fn()}
                referenceSample=""
                onReferenceSampleChange={vi.fn()}
                availableSamples={[]}
                voxtralVoiceId=""
                onVoxtralVoiceIdChange={vi.fn()}
                onResetTestText={vi.fn()}
                onSave={vi.fn()}
                isSaving={false}
            />
        );

        expect(screen.getByLabelText('Engine')).toHaveTextContent('XTTS');
        expect(screen.queryByText(/Voxtral \(Cloud\)/i)).not.toBeInTheDocument();
    });

    it('shows an existing Voxtral engine assignment even when cloud voices are disabled', () => {
        render(
            <ScriptEditor
                variantName="Voice"
                onVariantNameChange={vi.fn()}
                engine="voxtral"
                onEngineChange={vi.fn()}
                engines={[{ engine_id: 'voxtral', display_name: 'Voxtral', enabled: false, verified: true } as any]}
                testText="Preview"
                onTestTextChange={vi.fn()}
                referenceSample=""
                onReferenceSampleChange={vi.fn()}
                availableSamples={[]}
                voxtralVoiceId=""
                onVoxtralVoiceIdChange={vi.fn()}
                onResetTestText={vi.fn()}
                onSave={vi.fn()}
                isSaving={false}
            />
        );

        expect(screen.getByLabelText('Engine')).toHaveValue('voxtral');
        expect(screen.getByText(/assigned to Voxtral, but it is currently turned off in Settings/i)).toBeInTheDocument();
    });
});
