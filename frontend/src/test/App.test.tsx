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

  it('reports refreshing status during manual refresh', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'ready')
    })

    // Find the refresh button in SettingsTray
    const settingsButton = screen.getByTitle(/Synthesis Preferences/i)
    fireEvent.click(settingsButton)
    
    const refreshButton = screen.getByText(/Refresh All Data/i)
    
    // We need to delay the fetch response to see the refreshing state
    let resolveRefresh: any;
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => { resolveRefresh = resolve; }));

    fireEvent.click(refreshButton)
    
    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'refreshing')
    })

    resolveRefresh({ ok: true, json: () => Promise.resolve([]) });
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
})
