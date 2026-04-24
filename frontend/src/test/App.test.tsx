import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import App from '../App'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

let wsConnected = true;
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ connected: wsConnected })
}))

describe('App', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/home') {
        return Promise.resolve({
          json: () => Promise.resolve({
            projects: [],
            speaker_profiles: [
              { name: 'v1', speed: 1.0, wav_count: 1, is_default: true, preview_url: null },
              { name: 'v2', speed: 1.2, wav_count: 2, is_default: false, preview_url: null }
            ],
            paused: false
          })
        })
      }
      if (url === '/api/jobs') {
        return Promise.resolve({
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/processing_queue') {
        return Promise.resolve({
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/projects') {
        return Promise.resolve({
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/projects/p1') {
        return Promise.resolve({
          json: () => Promise.resolve({ id: 'p1', name: 'Project 1', series: null, author: null, speaker_profile_name: null })
        })
      }
      if (url === '/api/projects/p1/chapters') {
        return Promise.resolve({
          json: () => Promise.resolve([
            { id: 'c1', project_id: 'p1', title: 'Chapter 1', sort_order: 0, audio_status: 'done', predicted_audio_length: 0, char_count: 0, word_count: 0 }
          ])
        })
      }
      if (url === '/api/projects/p1/audiobooks') {
        return Promise.resolve({
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/chapters/c1') {
        return Promise.resolve({
          json: () => Promise.resolve({ id: 'c1', project_id: 'p1', title: 'Chapter 1', sort_order: 0, audio_status: 'done' })
        })
      }
      if (url === '/api/speakers') {
        return Promise.resolve({
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({ json: () => Promise.resolve({}) })
    }) as any
  })

  it('renders without crashing and fetches initials', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    
    await waitFor(() => {
      expect(screen.getByText(/Audiobook/i)).toBeTruthy()
    })
  })

  it('reports ready hydration status when idle and connected', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'ready')
    })
  })

  it('reports reconnecting and recovering statuses during WS loss', async () => {
    wsConnected = true;
    const { rerender } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'ready')
    })

    // Simulate WS loss
    wsConnected = false;
    rerender(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'reconnecting')
    })

    // Restore WS - should go to 'recovering' if refreshQueue('reconnect') is called
    act(() => {
      wsConnected = true;
    });

    let resolveReconnect: any;
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => { resolveReconnect = resolve; }));

    rerender(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'recovering')
    }, { timeout: 2000 })

    resolveReconnect({ ok: true, json: () => Promise.resolve([]) });

    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'ready')
    })
  })

  it('switches tabs', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
        expect(screen.getByText(/Audiobook/i)).toBeTruthy()
    })

    const queueTab = screen.getByText('Queue')
    fireEvent.click(queueTab)

    await waitFor(() => {
        expect(screen.getByText(/Queue is empty/i)).toBeTruthy()
    })

    const voicesTab = screen.getByText('Voices')
    fireEvent.click(voicesTab)

    await waitFor(() => {
        expect(screen.getByText('Voices', { selector: 'h2' })).toBeTruthy()
    })
  })

  it('opens the progress bar test page', async () => {
    render(
      <MemoryRouter initialEntries={['/progress-test']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Progress Bar Test')).toBeTruthy()
    })
  })

  it('opens the deep-linked settings engines page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'TTS Engines' })).toBeTruthy()
    })

    expect(screen.getByRole('button', { name: /Settings/i })).toHaveAttribute('aria-current', 'page')
  })

  it('opens deep-linked settings tabs directly on first load', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/api/']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'API' })).toBeTruthy()
    })

    expect(screen.getByText('Developer Integration Guide')).toBeTruthy()
  })

  it('opens a chapter route by resolving the parent project from chapter details', async () => {
    render(
      <MemoryRouter initialEntries={['/chapter/c1']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Chapter 1/i)).toBeTruthy()
    })

    expect(screen.queryByText('Loading chapter...')).toBeFalsy()
  })
})
