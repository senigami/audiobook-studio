import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditorTabs } from '@/pages/ChapterEditor/components/EditorTabs';

describe('EditorTabs', () => {
  it('calls setEditorTab when a tab is clicked', async () => {
    const setEditorTab = vi.fn();
    render(
      <EditorTabs
        editorTab="script"
        setEditorTab={setEditorTab}
        onSave={vi.fn().mockResolvedValue(true)}
        onRequestEditSourceText={vi.fn()}
        sourceTextMode="view"
      />
    );

    fireEvent.click(screen.getByText('Source Text'));
    expect(setEditorTab).toHaveBeenCalledWith('edit');

  });

  it('shows edit source text button in edit tab mode', () => {
    const onRequestEditSourceText = vi.fn();
    render(
      <EditorTabs
        editorTab="edit"
        setEditorTab={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        onRequestEditSourceText={onRequestEditSourceText}
        sourceTextMode="view"
      />
    );

    const editBtn = screen.getByRole('button', { name: 'Edit Source Text' });
    fireEvent.click(editBtn);
    expect(onRequestEditSourceText).toHaveBeenCalled();
  });
});
