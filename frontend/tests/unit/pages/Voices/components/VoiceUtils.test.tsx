import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Drawer, SpeedPopover } from '@/pages/Voices/components/VoiceUtils';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('Voice Utils', () => {
    describe('Drawer', () => {
        it('renders when open and handles close', () => {
            const onClose = vi.fn();
            render(
                <Drawer isOpen={true} onClose={onClose} title="Test Drawer">
                    <div>Content</div>
                </Drawer>
            );

            expect(screen.getByText('Test Drawer')).toBeInTheDocument();
            expect(screen.getByText('Content')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Close' }));

            expect(onClose).toHaveBeenCalled();
        });

        it('resizes the drawer width by dragging the resize handle, and stops on mouseup', () => {
            render(
                <Drawer isOpen={true} onClose={vi.fn()} title="Resizer">
                    <div>Content</div>
                </Drawer>
            );

            const dialog = screen.getByRole('dialog', { name: 'Resizer' });
            expect(dialog.style.width).toBe('800px');

            // Drawer renders through a portal onto document.body, so query via
            // screen (whole document) rather than the RTL render container.
            const handle = screen.getByRole('separator', { name: 'Resize drawer' });

            fireEvent.mouseDown(handle);
            fireEvent.mouseMove(window, { clientX: 500 });

            const resizedWidth = `${window.innerWidth - 500}px`;
            expect(dialog.style.width).toBe(resizedWidth);

            fireEvent.mouseUp(window);

            // Once released, further mouse movement must not keep resizing the drawer.
            fireEvent.mouseMove(window, { clientX: 200 });
            expect(dialog.style.width).toBe(resizedWidth);
        });
    });

    describe('SpeedPopover', () => {
        it('renders and handles speed change', () => {
            const onChange = vi.fn();
            const triggerRef = { current: document.createElement('button') };
            document.body.appendChild(triggerRef.current);
            
            render(
                <SpeedPopover 
                    value={1.0} 
                    onChange={onChange} 
                    triggerRef={triggerRef} 
                    onClose={vi.fn()} 
                />
            );

            const slider = screen.getByRole('slider');
            fireEvent.change(slider, { target: { value: '1.5' } });
            expect(onChange).toHaveBeenCalledWith(1.5);

            fireEvent.click(screen.getByText('1.25x'));
            expect(onChange).toHaveBeenCalledWith(1.25);
        });
    });
});
