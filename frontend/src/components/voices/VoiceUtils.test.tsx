import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Drawer, SpeedPopover } from './VoiceUtils';

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
            
            // X button
            const buttons = screen.getAllByRole('button');
            const closeBtn = buttons.find(b => b.innerHTML.includes('svg'));
            if (closeBtn) fireEvent.click(closeBtn);
            
            expect(onClose).toHaveBeenCalled();
        });

        it('handles resizing', () => {
            const { container } = render(
                <Drawer isOpen={true} onClose={vi.fn()} title="Resizer">
                    <div>Content</div>
                </Drawer>
            );

            const handle = container.querySelector('.resize-handle');
            if (handle) {
                fireEvent.mouseDown(handle);
                fireEvent.mouseMove(window, { clientX: 500 });
                fireEvent.mouseUp(window);
            }
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
