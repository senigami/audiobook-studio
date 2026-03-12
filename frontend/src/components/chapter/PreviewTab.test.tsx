import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PreviewTab } from './PreviewTab';

describe('PreviewTab', () => {
    it('renders analyzing state', () => {
        render(<PreviewTab analysis={null} analyzing={true} />);
        expect(screen.getByText(/Analyzing text/i)).toBeInTheDocument();
    });

    it('renders empty state', () => {
        render(<PreviewTab analysis={null} analyzing={false} />);
        expect(screen.getByText(/No analysis available/i)).toBeInTheDocument();
    });

    it('renders voice chunks', () => {
        const mockAnalysis = {
            sent_count: 2,
            char_count: 100,
            threshold: 250,
            voice_chunks: [
                { character_name: 'Alice', character_color: '#ff0000', text: 'Sentence 1.', length: 50 },
                { character_name: 'Bob', character_color: '#0000ff', text: 'Sentence 2.', length: 50 }
            ]
        };
        render(<PreviewTab analysis={mockAnalysis} analyzing={false} />);
        
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('Sentence 1.')).toBeInTheDocument();
    });

    it('renders safe text if no voice chunks', () => {
        const mockAnalysis = {
            safe_text: 'Block 1\nBlock 2',
            threshold: 250
        };
        render(<PreviewTab analysis={mockAnalysis} analyzing={false} />);
        expect(screen.getByText('Block 1')).toBeInTheDocument();
        expect(screen.getByText('Block 2')).toBeInTheDocument();
    });

    it('highlights long chunks', () => {
        const mockAnalysis = {
            threshold: 10,
            voice_chunks: [
                { character_name: 'Alice', text: 'Very long sentence indeed.', length: 25 }
            ]
        };
        const { container } = render(<PreviewTab analysis={mockAnalysis} analyzing={false} />);
        const html = container.innerHTML;
        // check for the red color on the length indicator
        expect(html).toContain('var(--error)');
    });
});
