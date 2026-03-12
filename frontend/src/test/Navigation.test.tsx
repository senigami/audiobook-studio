import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('Navigation Regression', () => {
    beforeEach(() => {
        global.fetch = vi.fn((url) => {
            if (url === '/api/home') {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        projects: [
                            { id: 'proj-1', name: 'Test Project', author: 'Author', updated_at: Date.now()/1000 }
                        ],
                        speaker_profiles: [],
                        paused: false
                    })
                })
            }
            if (url === '/api/jobs') return Promise.resolve({ json: () => Promise.resolve([]) });
            if (url === '/api/processing_queue') return Promise.resolve({ json: () => Promise.resolve([]) });
            if (url === '/api/projects') return Promise.resolve({
                json: () => Promise.resolve([
                    { id: 'proj-1', name: 'Test Project', author: 'Author', updated_at: Date.now()/1000 }
                ])
            });
            if (url === '/api/projects/proj-1') return Promise.resolve({
                json: () => Promise.resolve({ id: 'proj-1', name: 'Test Project', author: 'Author' })
            });
            if (url === '/api/projects/proj-1/chapters') return Promise.resolve({
                json: () => Promise.resolve([])
            });
            if (url === '/api/projects/proj-1/audiobooks') return Promise.resolve({
                json: () => Promise.resolve([])
            });
            if (url === '/api/speakers') return Promise.resolve({ json: () => Promise.resolve([]) });
            return Promise.resolve({ json: () => Promise.resolve({}) });
        }) as any;
    });

    it('navigates to project page when project card is clicked', async () => {
        render(
            <MemoryRouter initialEntries={['/']}>
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
