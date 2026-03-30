import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NewVoiceModal, RenameVoiceModal, AddVariantModal, MoveVariantModal } from './VoiceModals';
import { ScriptEditor } from './ScriptEditor';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('Voice Modals', () => {
  describe('NewVoiceModal', () => {
    it('renders and handles submit', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      render(
        <NewVoiceModal 
          isOpen={true} 
          onClose={vi.fn()} 
          value="New Voice" 
          onChange={onChange} 
          engine="xtts"
          onEngineChange={vi.fn()}
          voxtralEnabled={false}
          onSubmit={onSubmit} 
          isCreating={false} 
        />
      );

      expect(screen.getByText('Create New Voice')).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText(/Victor the Vampire/i), { target: { value: 'Updated' } });
      expect(onChange).toHaveBeenCalledWith('Updated');
      
      fireEvent.click(screen.getByRole('button', { name: 'Create Voice' }));
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('RenameVoiceModal', () => {
    it('renders with original name and handles submit', () => {
      const onSubmit = vi.fn();
      render(
        <RenameVoiceModal 
          isOpen={true} 
          onClose={vi.fn()} 
          originalName="Old Name" 
          value="New Name" 
          onChange={vi.fn()} 
          onSubmit={onSubmit} 
          isRenaming={false} 
        />
      );

      expect(screen.getByText('Old Name')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Rename Voice' }));
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('AddVariantModal', () => {
    it('renders and handles submit', () => {
      const onSubmit = vi.fn();
      render(
        <AddVariantModal 
          isOpen={true} 
          onClose={vi.fn()} 
          speakerName="Narrator" 
          value="Variant 2" 
          onChange={vi.fn()} 
          engine="xtts"
          onEngineChange={vi.fn()}
          voxtralEnabled={false}
          onSubmit={onSubmit} 
          isAdding={false} 
        />
      );

      expect(screen.getByText(/"Narrator"/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('MoveVariantModal', () => {
    it('renders list of speakers and handles selection', () => {
        const onSelectSpeaker = vi.fn();
        const onSubmit = vi.fn();
        const speakers = [{ id: 's1', name: 'Speaker 1' }, { id: 's2', name: 'Speaker 2' }];
        
        render(
            <MoveVariantModal 
                isOpen={true} 
                onClose={vi.fn()} 
                variantName="Variant X" 
                speakers={speakers} 
                selectedSpeakerId="s1" 
                onSelectSpeaker={onSelectSpeaker} 
                onSubmit={onSubmit} 
                isMoving={false} 
            />
        );

        expect(screen.getByText(/"Variant X"/i)).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 's2' } });
        expect(onSelectSpeaker).toHaveBeenCalledWith('s2');

        fireEvent.click(screen.getByRole('button', { name: 'Move Variant' }));
        expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('ScriptEditor', () => {
    it('keeps the variant field editable and explains voice renaming separately', () => {
      render(
        <ScriptEditor
          variantName="Default"
          onVariantNameChange={vi.fn()}
          engine="xtts"
          onEngineChange={vi.fn()}
          voxtralEnabled={false}
          testText="Preview script"
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

      expect(screen.getByDisplayValue('Default')).not.toBeDisabled();
      expect(screen.getByText(/Changing the variant label updates how this profile appears in the app\./i)).toBeInTheDocument();
    });

    it('keeps custom imported base variant labels editable', () => {
      render(
        <ScriptEditor
          variantName="New Zealand"
          onVariantNameChange={vi.fn()}
          engine="xtts"
          onEngineChange={vi.fn()}
          voxtralEnabled={false}
          testText="Preview script"
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

      expect(screen.getByDisplayValue('New Zealand')).not.toBeDisabled();
      expect(screen.getByText(/Changing the variant label updates how this profile appears in the app\./i)).toBeInTheDocument();
    });
  });
});
