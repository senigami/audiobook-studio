import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudioHeaderActions } from '@/pages/Book/studio/StudioHeaderActions';

vi.mock('@/utils/devMode', () => ({
  useDevMode: () => true,
}));

describe('StudioHeaderActions', () => {
  it('renders commit, navigation, export, and debug actions', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onCommitChanges = vi.fn();
    const onExportAudio = vi.fn();
    const onCopyDebugState = vi.fn();

    render(
      <StudioHeaderActions
        hasUnsavedChanges
        onCommitChanges={onCommitChanges}
        onPrev={onPrev}
        onNext={onNext}
        onExportAudio={onExportAudio}
        onCopyDebugState={onCopyDebugState}
      />,
    );

    expect(screen.getByText(/unsaved text edit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commit changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & prev/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & next/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /debug/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save & prev/i }));
    fireEvent.click(screen.getByRole('button', { name: /save & next/i }));
    fireEvent.click(screen.getByRole('button', { name: /commit changes/i }));
    fireEvent.click(screen.getByRole('button', { name: /debug/i }));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onCommitChanges).toHaveBeenCalledTimes(1);
    expect(onCopyDebugState).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /^wav$/i }));
    expect(onExportAudio).toHaveBeenCalledWith('wav');
  });

  it('shows export busy state when a format is exporting', () => {
    render(
      <StudioHeaderActions
        hasUnsavedChanges={false}
        onCommitChanges={vi.fn()}
        onExportAudio={vi.fn()}
        exportingFormat="mp3"
      />,
    );

    expect(screen.getByText(/exporting mp3/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more actions/i })).toBeDisabled();
  });
});
