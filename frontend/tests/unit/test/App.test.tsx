import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import App from '@/app/App'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { publishStudioSocketMessage } from '@/store/studioSocketBus'
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore'
import { setDevModeEnabled } from '@/utils/devMode'

let wsConnected = true;
let activeConnections = 0;
const mockUseWebSocket = vi.fn(() => {
  useEffect(() => {
    activeConnections++;
    return () => {
      activeConnections--;
    };
  }, []);
  return {
    connected: wsConnected,
    sendMessage: vi.fn()
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => mockUseWebSocket()
}));

describe('App', () => {

  beforeEach(() => {
    localStorage.clear()
    mockUseWebSocket.mockClear();
    activeConnections = 0;
    act(() => {
      resetLiveEventAuditForTests();
    });
    global.fetch = vi.fn((url) => {
      if (url === '/api/home') {
        return Promise.resolve({
          ok: true,
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
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/processing_queue') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/projects/p1') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'p1', name: 'Project 1', series: null, author: null, speaker_profile_name: null })
        })
      }
      if (url === '/api/projects/p1/chapters') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'c1', project_id: 'p1', title: 'Chapter 1', sort_order: 0, audio_status: 'done', predicted_audio_length: 0, char_count: 0, word_count: 0 }
          ])
        })
      }
      if (url === '/api/projects/p1/audiobooks') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      if (url === '/api/chapters/c1') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'c1', project_id: 'p1', title: 'Chapter 1', sort_order: 0, audio_status: 'done' })
        })
      }
      if (url === '/api/chapters/c1/script-view') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            chapter_id: 'c1',
            base_revision_id: null,
            paragraphs: [],
            spans: [],
            render_batches: [],
            audio_groups: [],
          })
        })
      }
      if (url === '/api/speakers') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as any
  })

  it('renders without crashing and fetches initials', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toBeTruthy()
    })
  })

  it('proves only one websocket transport is mounted from App', async () => {
    mockUseWebSocket.mockClear()
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toBeTruthy()
    })
    expect(activeConnections).toBe(1)
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
        expect(screen.getByTestId('layout-root')).toBeTruthy()
    })

    const queueTab = screen.getAllByRole('button', { name: 'Queue' })[0]
    fireEvent.click(queueTab)

    await waitFor(() => {
        expect(screen.getByText(/Queue is empty/i)).toBeTruthy()
    })

    const voicesTab = screen.getAllByRole('button', { name: 'Voices' })[0]
    fireEvent.click(voicesTab)

    await waitFor(() => {
        expect(screen.getByText('Voices', { selector: 'h2' })).toBeTruthy()
    })
  })

  it('opens the activity page', async () => {
    render(
      <MemoryRouter initialEntries={['/activity']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Global Queue')).toBeTruthy()
    })

    expect(screen.getByText('Stats')).toBeTruthy()
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

  it('redirects project routes into the book pipeline while preserving query params', async () => {
    render(
      <MemoryRouter initialEntries={['/project/p1?tab=characters&foo=bar']}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/book/p1/casting')
    })

    const search = new URLSearchParams(screen.getByTestId('location-probe').textContent?.split('?')[1] || '')
    expect(search.get('foo')).toBe('bar')
    expect(search.has('tab')).toBe(false)
  })

  it('redirects chapter routes into the book studio stage with the chapter query', async () => {
    render(
      <MemoryRouter initialEntries={['/chapter/c1?foo=bar']}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/book/p1/studio')
    })

    const search = new URLSearchParams(screen.getByTestId('location-probe').textContent?.split('?')[1] || '')
    expect(search.get('chapter')).toBe('c1')
    expect(search.get('foo')).toBe('bar')
  })

  it('shows developer rail links in dev mode and marks progress test active', async () => {
    act(() => {
      setDevModeEnabled(true)
    })

    render(
      <MemoryRouter initialEntries={['/progress-test']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Progress Bar Test')).toBeTruthy()
    })

    expect(screen.getByText('DEVELOPER')).toBeTruthy()
    expect(
      screen
        .getAllByRole('button', { name: 'Progress test' })
        .some((button) => button.getAttribute('aria-current') === 'page')
    ).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Event stream' }).length).toBeGreaterThan(0)
  })

  it('shows developer rail links in dev mode and marks event stream active', async () => {
    act(() => {
      setDevModeEnabled(true)
    })

    render(
      <MemoryRouter initialEntries={['/event-stream']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    })

    expect(screen.getByText('DEVELOPER')).toBeTruthy()
    expect(
      screen
        .getAllByRole('button', { name: 'Event stream' })
        .some((button) => button.getAttribute('aria-current') === 'page')
    ).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Progress test' }).length).toBeGreaterThan(0)
  })

  it('keeps direct dev routes available when the developer rail group is hidden', async () => {
    render(
      <MemoryRouter initialEntries={['/event-stream']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    })

    expect(screen.queryByText('DEVELOPER')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Progress test' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Event stream' })).toBeNull()
  })

  it('opens the deep-linked engines page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Engines' })).toBeTruthy()
    })

    expect(
      screen.getAllByRole('button', { name: /Engines/i }).some((button) => button.getAttribute('aria-current') === 'page')
    ).toBe(true)
  })

  it('opens the standalone integrations page', async () => {
    render(
      <MemoryRouter initialEntries={['/integrations']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Integrations' })).toBeTruthy()
    })

    expect(screen.getByRole('heading', { name: 'Security Note' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View Swagger Docs' })).toHaveAttribute('href', '/api/v1/tts/docs')
  })

  it('redirects deep-linked api settings tabs to integrations', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/api/']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Integrations' })).toBeTruthy()
    })

    expect(screen.getByRole('heading', { name: 'Security Note' })).toBeTruthy()
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

  it('opens the standalone secret route and renders the live output table', async () => {
    render(
      <MemoryRouter initialEntries={['/event-stream']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    })
  })

  it('ensures the old /internal/live-output route does not render the page', async () => {
    render(
      <MemoryRouter initialEntries={['/internal/live-output']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /all/i })).not.toBeInTheDocument()
    })
  })

  it('ensures the secret route is not present in the main navigation', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toBeTruthy()
    })

    // Check that there is no nav link pointing to the secret path
    const navLinks = screen.queryAllByRole('link')
    const liveOutputLink = navLinks.find(link => link.getAttribute('href') === '/event-stream')
    expect(liveOutputLink).toBeUndefined()
  })

  it('navigating to the lazy /voices route resolves and renders content after suspense', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    // Wait for the app shell to load
    await waitFor(() => {
      expect(screen.getByTestId('layout-root')).toBeTruthy()
    })

    // Navigate to the lazy /voices route
    const voicesTab = screen.getAllByRole('button', { name: 'Voices' })[0]
    fireEvent.click(voicesTab)

    // The lazy chunk resolves and the Voices heading becomes visible
    await waitFor(() => {
      expect(screen.getByText('Voices', { selector: 'h2' })).toBeTruthy()
    })
  })

  it('renders live socket messages on the standalone page', async () => {
    render(
      <MemoryRouter initialEntries={['/event-stream']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    })

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        ids: { jobId: 'job-live' },
        payload: { status: 'running' },
      })
    })

    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument()
    })
  })
})
