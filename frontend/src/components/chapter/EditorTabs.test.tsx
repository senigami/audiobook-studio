import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditorTabs } from './EditorTabs';

describe('EditorTabs', () => {
  it('renders all tab buttons', () => {
    render(
      <EditorTabs
        editorTab="script"
        setEditorTab={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        onEnsureVoiceChunks={vi.fn().mockResolvedValue(undefined)}
        onRequestEditSourceText={vi.fn()}
        analysis={null}
        loadingVoiceChunks={false}
        sourceTextMode="view"
      />
    );

    expect(screen.getByText('Script')).toBeInTheDocument();
    expect(screen.getByText('Source Text')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Preview Safe Output')).toBeInTheDocument();
  });

  it('calls setEditorTab when a tab is clicked', async () => {
    const setEditorTab = vi.fn();
    render(
      <EditorTabs
        editorTab="script"
        setEditorTab={setEditorTab}
        onSave={vi.fn().mockResolvedValue(true)}
        onEnsureVoiceChunks={vi.fn().mockResolvedValue(undefined)}
        onRequestEditSourceText={vi.fn()}
        analysis={null}
        loadingVoiceChunks={false}
        sourceTextMode="view"
      />
    );

    fireEvent.click(screen.getByText('Production'));
    await waitFor(() => {
      expect(setEditorTab).toHaveBeenCalledWith('production');
    });
  });

  it('shows edit source text button in edit tab mode', () => {
    const onRequestEditSourceText = vi.fn();
    render(
      <EditorTabs
        editorTab="edit"
        setEditorTab={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        onEnsureVoiceChunks={vi.fn().mockResolvedValue(undefined)}
        onRequestEditSourceText={onRequestEditSourceText}
        analysis={null}
        loadingVoiceChunks={false}
        sourceTextMode="view"
      />
    );

    const editBtn = screen.getByRole('button', { name: 'Edit Source Text' });
    fireEvent.click(editBtn);
    expect(onRequestEditSourceText).toHaveBeenCalled();
  });
});
