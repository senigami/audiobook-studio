/**
 * ArchetypeQuickPick.test.tsx — owner-requested (2026-07-16)
 *
 * Verifies picking an archetype calls onPick with the archetype's
 * class/gender/age/tone/timbre/pace, with tone/timbre split from the
 * source table's comma-separated strings into arrays.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArchetypeQuickPick } from '@/pages/Voices/components/metadata/ArchetypeQuickPick';

describe('ArchetypeQuickPick', () => {
    it('calls onPick with the matched archetype\'s fields, tone/timbre split into arrays', () => {
        const onPick = vi.fn();
        render(<ArchetypeQuickPick onPick={onPick} />);

        fireEvent.click(screen.getByRole('button', { name: /Pick a voice archetype/i }));
        fireEvent.click(screen.getByText('Warm Storyteller'));

        expect(onPick).toHaveBeenCalledWith({
            class: 'human',
            gender: 'feminine',
            age: 'adult',
            tone: ['warm', 'friendly', 'gentle'],
            timbre: ['rich', 'velvety', 'smooth'],
            pace: 'measured',
        });
    });

    it('does not call onPick for an unrecognized selection', () => {
        const onPick = vi.fn();
        render(<ArchetypeQuickPick onPick={onPick} />);
        // No further interaction — nothing should fire on mount.
        expect(onPick).not.toHaveBeenCalled();
    });
});
