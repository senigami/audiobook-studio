/**
 * VoiceDetailTabs.test.tsx — voice-card-consolidation task 001
 *
 * Fires real ArrowLeft/ArrowRight/Home/End keydown events on the rendered
 * tablist (via testing-library's fireEvent) and asserts document.activeElement,
 * tabIndex, and aria-selected update correctly on the actual rendered DOM
 * nodes — per this task's explicit test requirement.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceDetailTabs, type VoiceDetailTabDef } from '@/pages/VoiceLab/components/VoiceDetailTabs';

const tabs: VoiceDetailTabDef[] = [
    { id: 'overview', label: 'Overview', content: <p>Overview content</p> },
    { id: 'samples', label: 'Samples', content: <p>Samples content</p> },
    { id: 'variants', label: 'Variants', content: <p>Variants content</p> },
    { id: 'test', label: 'Test', content: <p>Test content</p> },
];

describe('VoiceDetailTabs', () => {
    it('renders the full ARIA tabs structure with the first tab active by default', () => {
        render(<VoiceDetailTabs tabs={tabs} />);

        const tablist = screen.getByRole('tablist', { name: 'Voice management' });
        expect(tablist).toBeInTheDocument();

        const tabButtons = screen.getAllByRole('tab');
        expect(tabButtons).toHaveLength(4);
        expect(tabButtons[0]).toHaveAttribute('aria-selected', 'true');
        expect(tabButtons[0]).toHaveAttribute('tabIndex', '0');
        expect(tabButtons[1]).toHaveAttribute('aria-selected', 'false');
        expect(tabButtons[1]).toHaveAttribute('tabIndex', '-1');

        // aria-controls/aria-labelledby pairing
        const panel = screen.getByRole('tabpanel');
        expect(panel).toHaveAttribute('aria-labelledby', tabButtons[0].id);
        expect(tabButtons[0]).toHaveAttribute('aria-controls', panel.id);
    });

    it('ArrowRight moves the roving tabindex/focus/selection to the next tab', () => {
        render(<VoiceDetailTabs tabs={tabs} />);
        const tabButtons = screen.getAllByRole('tab');

        tabButtons[0].focus();
        fireEvent.keyDown(tabButtons[0], { key: 'ArrowRight' });

        expect(document.activeElement).toBe(tabButtons[1]);
        expect(tabButtons[1]).toHaveAttribute('aria-selected', 'true');
        expect(tabButtons[1]).toHaveAttribute('tabIndex', '0');
        expect(tabButtons[0]).toHaveAttribute('aria-selected', 'false');
        expect(tabButtons[0]).toHaveAttribute('tabIndex', '-1');
    });

    it('ArrowRight wraps from the last tab back to the first', () => {
        render(<VoiceDetailTabs tabs={tabs} defaultTabId="test" />);
        const tabButtons = screen.getAllByRole('tab');

        tabButtons[3].focus();
        fireEvent.keyDown(tabButtons[3], { key: 'ArrowRight' });

        expect(document.activeElement).toBe(tabButtons[0]);
        expect(tabButtons[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('ArrowLeft moves to the previous tab and wraps from the first to the last', () => {
        render(<VoiceDetailTabs tabs={tabs} />);
        const tabButtons = screen.getAllByRole('tab');

        tabButtons[0].focus();
        fireEvent.keyDown(tabButtons[0], { key: 'ArrowLeft' });

        expect(document.activeElement).toBe(tabButtons[3]);
        expect(tabButtons[3]).toHaveAttribute('aria-selected', 'true');
        expect(tabButtons[3]).toHaveAttribute('tabIndex', '0');
    });

    it('End moves focus/selection to the last tab', () => {
        render(<VoiceDetailTabs tabs={tabs} />);
        const tabButtons = screen.getAllByRole('tab');

        tabButtons[0].focus();
        fireEvent.keyDown(tabButtons[0], { key: 'End' });

        expect(document.activeElement).toBe(tabButtons[3]);
        expect(tabButtons[3]).toHaveAttribute('aria-selected', 'true');
    });

    it('Home moves focus/selection back to the first tab', () => {
        render(<VoiceDetailTabs tabs={tabs} defaultTabId="variants" />);
        const tabButtons = screen.getAllByRole('tab');

        tabButtons[2].focus();
        fireEvent.keyDown(tabButtons[2], { key: 'Home' });

        expect(document.activeElement).toBe(tabButtons[0]);
        expect(tabButtons[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('clicking a tab activates it and hides the other panels', () => {
        render(<VoiceDetailTabs tabs={tabs} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Samples' }));

        expect(screen.getByRole('tab', { name: 'Samples' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Samples content')).toBeVisible();
        expect(screen.getByText('Overview content')).not.toBeVisible();
    });

    it('announces the panel change for assistive tech on tab change', () => {
        render(<VoiceDetailTabs tabs={tabs} />);
        const tabButtons = screen.getAllByRole('tab');

        tabButtons[0].focus();
        fireEvent.keyDown(tabButtons[0], { key: 'ArrowRight' });

        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Samples panel selected');
    });
});
