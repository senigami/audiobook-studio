import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductionTab } from './ProductionTab';
import type { ChapterSegment, Character, SpeakerProfile } from '../../types';

describe('ProductionTab', () => {
  const mockSegments: ChapterSegment[] = [
    { 
      id: 'seg-1', 
      chapter_id: 'chap-1', 
      text_content: 'Sentence one.', 
      segment_order: 0, 
      audio_status: 'unprocessed',
      character_id: 'char-1',
      speaker_profile_name: 'Profile 1',
      audio_file_path: '',
      audio_generated_at: 0
    },
    { 
      id: 'seg-2', 
      chapter_id: 'chap-1', 
      text_content: 'Sentence two.', 
      segment_order: 1, 
      audio_status: 'done',
      character_id: null,
      speaker_profile_name: 'Narrator',
      audio_file_path: '/audio/2.wav',
      audio_generated_at: 1000
    }
  ];

  const mockCharacters: Character[] = [
    { id: 'char-1', project_id: 'proj-1', name: 'Char 1', color: '#ff0000', speaker_profile_name: 'Voice 1' } as any
  ];

  const mockProfiles: SpeakerProfile[] = [
    { name: 'Profile 1', speaker_id: 'speaker-1', variant_name: 'Standard', voice_id: 'v1', provider: 'elevenlabs' } as any,
    { name: 'Profile 2', speaker_id: 'speaker-1', variant_name: 'Warm', voice_id: 'v2', provider: 'elevenlabs' } as any
  ];

  const mockBlocks = [
    {
      id: 'block-1',
      order_index: 0,
      text: 'Sentence one.',
      character_id: 'char-1',
      speaker_profile_name: 'Profile 1',
      status: 'draft',
      source_segment_ids: ['seg-1']
    },
    {
      id: 'block-2',
      order_index: 1,
      text: 'Sentence two.',
      character_id: null,
      speaker_profile_name: 'Narrator',
      status: 'rendered',
      source_segment_ids: ['seg-2']
    }
  ];

  it('renders editable production blocks with status and render batch context', () => {
    render(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[
          { id: 'batch-1', block_ids: ['block-1'], status: 'queued', estimated_work_weight: 1 }
        ]}
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId={null} 
        selectedProfileName={null}
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={vi.fn()} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={vi.fn().mockResolvedValue({ blocks: mockBlocks, base_revision_id: 'rev-2' })} 
        onReloadBlocks={vi.fn().mockResolvedValue({ blocks: mockBlocks, base_revision_id: 'rev-2', render_batches: [] })}
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    expect(screen.getByText('Production Blocks')).toBeInTheDocument();
    expect(screen.getByText('Block 1')).toBeInTheDocument();
    expect(screen.getByText('Block 2')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Rendered')).toBeInTheDocument();
    expect(screen.getByText('Render batches')).toBeInTheDocument();
    expect(screen.getByText('Sentence one.')).toBeInTheDocument();
    expect(screen.getByText('Sentence two.')).toBeInTheDocument();
  });

  it('supports local editing, split/merge/delete, and source-segment assignment', () => {
    const onBulkAssign = vi.fn();
    const onSaveBlocks = vi.fn().mockResolvedValue({ blocks: mockBlocks, base_revision_id: 'rev-2' });
    render(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[]} 
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId="char-1" 
        selectedProfileName="Profile 1"
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={onBulkAssign} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={onSaveBlocks} 
        onReloadBlocks={vi.fn().mockResolvedValue({ blocks: mockBlocks, base_revision_id: 'rev-2', render_batches: [] })}
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    fireEvent.change(screen.getByLabelText('Production block 1 text'), {
      target: { value: 'Sentence one. updated.' }
    });
    expect(screen.getByText('Edited')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /split/i })[0]);
    expect(screen.getByText(/raw text override/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /apply selection/i })[0]);
    expect(onBulkAssign).toHaveBeenCalledWith(['seg-1']);

    fireEvent.click(screen.getByRole('button', { name: /save blocks/i }));
    expect(onSaveBlocks).toHaveBeenCalled();
  });

  it('surfaces conflict message and allows recovery through reload', async () => {
    const onReloadBlocks = vi.fn().mockResolvedValue({ blocks: mockBlocks, base_revision_id: 'rev-2', render_batches: [] });
    const onSaveBlocks = vi.fn(); 
    
    const { rerender } = render(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[]} 
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId={null} 
        selectedProfileName={null}
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={vi.fn()} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={onSaveBlocks} 
        onReloadBlocks={onReloadBlocks}
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    fireEvent.change(screen.getByLabelText('Production block 1 text'), {
      target: { value: 'Draft edit' }
    });
    
    expect(screen.getByText('Edited')).toBeInTheDocument();

    rerender(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[]} 
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId={null} 
        selectedProfileName={null}
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={vi.fn()} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={onSaveBlocks} 
        onReloadBlocks={onReloadBlocks}
        saveConflictError="Revision conflict occurred"
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    expect(screen.getByText(/Save Conflict:/i)).toBeInTheDocument();
    expect(screen.getByText(/Revision conflict occurred/i)).toBeInTheDocument();
    
    expect(screen.getByDisplayValue('Draft edit')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /reload latest/i })[1]);
    expect(onReloadBlocks).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Sentence one.')).toBeInTheDocument();
    });
  });

  it('reloads the latest blocks from the reload button', async () => {
    const onReloadBlocks = vi.fn().mockResolvedValue({ blocks: mockBlocks, base_revision_id: 'rev-2', render_batches: [] });
    render(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[]} 
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId={null} 
        selectedProfileName={null}
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={vi.fn()} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={vi.fn()} 
        onReloadBlocks={onReloadBlocks}
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    fireEvent.change(screen.getByLabelText('Production block 1 text'), {
      target: { value: 'Draft edit' }
    });
    
    const reloadBtn = screen.getByRole('button', { name: /reload latest/i });
    fireEvent.click(reloadBtn);
    expect(onReloadBlocks).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Sentence one.')).toBeInTheDocument();
    });
  });

  it('supports render batch generation actions', () => {
    const onGenerateBatch = vi.fn();
    const mockRenderBatch = { 
      id: 'batch-1', 
      block_ids: ['block-1'], 
      status: 'stale', 
      estimated_work_weight: 10 
    };
    
    render(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[mockRenderBatch]} 
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId={null} 
        selectedProfileName={null}
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={vi.fn()} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={vi.fn()} 
        onReloadBlocks={vi.fn()}
        onGenerateBatch={onGenerateBatch}
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText(/text changed since render/i)).toBeInTheDocument();
    expect(screen.getByText('1 blocks · 10 units')).toBeInTheDocument();
    
    const genBtn = screen.getByTitle('Rebuild batch-1');
    expect(genBtn).toHaveTextContent('Rebuild');
    fireEvent.click(genBtn);
    
    expect(onGenerateBatch).toHaveBeenCalledWith(['seg-1']);
  });

  it('supports failed render batch recovery actions', () => {
    const onGenerateBatch = vi.fn();
    const mockRenderBatch = { 
      id: 'batch-failed', 
      block_ids: ['block-1'], 
      status: 'failed', 
      estimated_work_weight: 10 
    };
    
    render(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[mockRenderBatch]} 
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId={null} 
        selectedProfileName={null}
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={vi.fn()} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={vi.fn()} 
        onReloadBlocks={vi.fn()}
        onGenerateBatch={onGenerateBatch}
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/last render failed/i)).toBeInTheDocument();
    
    const retryBtn = screen.getByTitle('Retry batch-failed');
    expect(retryBtn).toHaveTextContent('Retry');
    fireEvent.click(retryBtn);
    
    expect(onGenerateBatch).toHaveBeenCalledWith(['seg-1']);
  });

  it('disables batch generation when edits are dirty', () => {
    const onGenerateBatch = vi.fn();
    const mockRenderBatch = { 
      id: 'batch-1', 
      block_ids: ['block-1'], 
      status: 'stale', 
      estimated_work_weight: 10 
    };
    
    render(
      <ProductionTab 
        chapterId="chap-1"
        blocks={mockBlocks as any}
        renderBatches={[mockRenderBatch]} 
        baseRevisionId="rev-1"
        characters={mockCharacters} 
        speakerProfiles={mockProfiles} 
        selectedCharacterId={null} 
        selectedProfileName={null}
        hoveredBlockId={null} 
        setHoveredBlockId={vi.fn()} 
        activeBlockId={null} 
        setActiveBlockId={vi.fn()} 
        onBulkAssign={vi.fn()} 
        onBulkReset={vi.fn()} 
        onSaveBlocks={vi.fn()} 
        onReloadBlocks={vi.fn()}
        onGenerateBatch={onGenerateBatch}
        pendingSegmentIds={new Set()} 
        queuedSegmentIds={new Set()} 
        segments={mockSegments} 
        segmentsCount={2} 
      />
    );

    fireEvent.change(screen.getByLabelText('Production block 1 text'), {
      target: { value: 'Dirty edit' }
    });
    
    const genBtn = screen.getByTitle('Save blocks before generating');
    expect(genBtn).toBeDisabled();
  });
});
