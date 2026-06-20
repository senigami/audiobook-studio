import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/app/App';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('Navigation Regression', () => {
    beforeEach(() => {
        const originalError = console.error;
        console.error = vi.fn((...args) => {
            console.log('CAUGHT CONSOLE ERROR:', ...args);
            originalError(...args);
        });
        global.fetch = vi.fn((url) => {
            if (url === '/api/home') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        projects: [
                            { id: 'proj-1', name: 'Test Project', author: 'Author', updated_at: Date.now()/1000 }
                        ],
                        speaker_profiles: [],
                        paused: false
                    })
                })
            }
            if (url === '/api/jobs') return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            if (url === '/api/processing_queue') return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            if (url === '/api/projects') return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([
                    { id: 'proj-1', name: 'Test Project', author: 'Author', updated_at: Date.now()/1000 }
                ])
            });
            if (url === '/api/projects/proj-1') return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ id: 'proj-1', name: 'Test Project', author: 'Author' })
            });
            if (url === '/api/projects/proj-1/chapters') return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([])
            });
            if (url === '/api/projects/proj-1/audiobooks') return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([])
            });
            if (url === '/api/speakers') return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }) as any;
    });

    it('navigates to project page when project card is clicked', async () => {
        render(
            <MemoryRouter initialEntries={['/library']}>
                <App />
            </MemoryRouter>
        );

        // Wait for project library to load
        await waitFor(() => {
            expect(screen.getByText('Test Project')).toBeTruthy();
        });

        // Click the project card
        fireEvent.click(screen.getByText('Test Project'));

        // Check if navigation happened
        await waitFor(() => {
            const projectHeaders = screen.getAllByText('Test Project');
            expect(projectHeaders.length).toBeGreaterThan(0);
        });
    });
});
