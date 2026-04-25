import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditTab } from './EditTab';

const mockChapter = {
    id: 'c1',
    project_id: 'p1',
    title: 'Chapter 1',
    text_content: 'Test content',
    speaker_profile_name: null,
    sort_order: 0,
    audio_status: 'unprocessed' as const,
    audio_file_path: null,
    text_last_modified: Date.now(),
    audio_generated_at: null,
    char_count: 12,
    word_count: 2,
    sent_count: 1,
    predicted_audio_length: 0,
    audio_length_seconds: 0
};

describe('EditTab', () => {
    it('renders and handles text change', () => {
        const setText = vi.fn();
        render(
            <EditTab 
                text="Initial" 
                setText={setText} 
                analysis={null} 
                setAnalysis={vi.fn()} 
                analyzing={false} 
                chapter={mockChapter} 
                segmentsCount={0} 
                hasUnsavedChanges={false}
                sourceTextMode="edit"
            />
        );

        const textarea = screen.getByPlaceholderText(/Start typing/i);
        fireEvent.change(textarea, { target: { value: 'New text' } });
        expect(setText).toHaveBeenCalledWith('New text');
    });

    it('shows analyzing state', () => {
        render(
            <EditTab 
                text="" 
                setText={vi.fn()} 
                analysis={null} 
                setAnalysis={vi.fn()} 
                analyzing={true} 
                chapter={mockChapter} 
                segmentsCount={0} 
                hasUnsavedChanges={false}
            />
        );
        expect(screen.getByText('Analysis')).toBeInTheDocument();
    });

    it('shows estimated time in different formats', () => {
        const { rerender } = render(
            <EditTab 
                text="" 
                setText={vi.fn()} 
                analysis={{ predicted_seconds: 45 }} 
                setAnalysis={vi.fn()} 
                analyzing={false} 
                chapter={mockChapter} 
                segmentsCount={0} 
                hasUnsavedChanges={false}
            />
        );
        expect(screen.getByText('45s')).toBeInTheDocument();

        rerender(
            <EditTab 
                text="" 
                setText={vi.fn()} 
                analysis={{ predicted_seconds: 125 }} 
                setAnalysis={vi.fn()} 
                analyzing={false} 
                chapter={mockChapter} 
                segmentsCount={0} 
                hasUnsavedChanges={false}
            />
        );
        expect(screen.getByText('2m 5s')).toBeInTheDocument();

        rerender(
            <EditTab 
                text="" 
                setText={vi.fn()} 
                analysis={{ predicted_seconds: 3665 }} 
                setAnalysis={vi.fn()} 
                analyzing={false} 
                chapter={mockChapter} 
                segmentsCount={0} 
                hasUnsavedChanges={false}
            />
        );
        expect(screen.getByText('1h 1m')).toBeInTheDocument();
    });

    it('shows long sentence warnings and handles uncleanable toggle', () => {
        const setAnalysis = vi.fn();
        const analysis = {
            raw_long_sentences: 5,
            auto_fixed: 3,
            uncleanable: 2,
            _showUncleanable: false,
            uncleanable_sentences: [{ text: 'Very long...', length: 300 }]
        };

        const { rerender } = render(
            <EditTab 
                text="" 
                setText={vi.fn()} 
                analysis={analysis} 
                setAnalysis={setAnalysis} 
                analyzing={false} 
                chapter={mockChapter} 
                segmentsCount={10} 
                hasUnsavedChanges={false}
            />
        );

        expect(screen.getByText(/3\/5 long sentences auto-fixed/i)).toBeInTheDocument();
        const actionRequired = screen.getByText(/ACTION REQUIRED: 2/i);
        
        // Small hack for the callback
        fireEvent.click(actionRequired);
        expect(setAnalysis).toHaveBeenCalled();

        // Rerender with showUncleanable: true
        rerender(
            <EditTab 
                text="" 
                setText={vi.fn()} 
                analysis={{ ...analysis, _showUncleanable: true }} 
                setAnalysis={setAnalysis} 
                analyzing={false} 
                chapter={mockChapter} 
                segmentsCount={10} 
                hasUnsavedChanges={false}
            />
        );

        expect(screen.getByText(/These sentences are still too long/i)).toBeInTheDocument();
        expect(screen.getByText('Very long...')).toBeInTheDocument();
    });

    it('shows raw text edit warning when changes are unsaved', () => {
        render(
            <EditTab 
                text="Changed text content" 
                setText={vi.fn()} 
                analysis={null} 
                setAnalysis={vi.fn()} 
                analyzing={false} 
                chapter={mockChapter} 
                segmentsCount={0} 
                hasUnsavedChanges={true}
                sourceTextMode="edit"
            />
        );
        expect(screen.getByText(/Unsaved changes detected/i)).toBeInTheDocument();
        expect(screen.getByText(/resync production blocks/i)).toBeInTheDocument();
    });
});
