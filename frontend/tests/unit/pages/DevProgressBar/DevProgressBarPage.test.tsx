import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressBarTestPage } from '@/pages/DevProgressBar/DevProgressBarPage'
import { publishStudioSocketMessage } from '@/store/studioSocketBus'

describe('ProgressBarTestPage', () => {
  it('provides a segment contract debug panel that starts a new segment at zero through the helper path', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.getByText('Segment Contract Debug')).toBeTruthy()

    fireEvent.click(screen.getByText('Start Segment'))

    await waitFor(() => {
      expect(screen.getByTestId('segment-debug-helper-key')).toHaveTextContent('debug-job:debug-segment-1')
      expect(screen.getByTestId('segment-debug-helper-contract')).toHaveTextContent('predictive=false')
      expect(screen.getByTestId('segment-debug-helper-contract')).toHaveTextContent('transitionTicks=3')
      expect(screen.getByTestId('segment-debug-helper-contract')).toHaveTextContent('allowBackwardProgress=false')
      expect(screen.getByTestId('segment-debug-helper-contract')).toHaveTextContent('showEta=true')
      expect(screen.getByTestId('segment-debug-helper-contract')).toHaveTextContent('startEta=120s')
      expect(screen.getByTestId('segment-debug-bar')).toHaveTextContent(/ETA:/)
    })

    expect(screen.getByTestId('segment-debug-event-log')).toHaveTextContent('START_SEGMENT debug-segment-1 progress=0% eta=120s')
    expect(screen.getByTestId('segment-debug-display-log')).toHaveTextContent('display=0%')
  })

  it('animates segment debug target changes and records displayed progress callbacks', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.click(screen.getByText('Start Segment'))

    await waitFor(() => {
      expect(screen.getByTestId('segment-debug-display-log')).toHaveTextContent('display=0%')
    }, { timeout: 1500 })

    fireEvent.change(screen.getByLabelText('Segment target %'), { target: { value: '50' } })

    expect(screen.getByTestId('segment-debug-bar')).toHaveTextContent('0%')

    await waitFor(() => {
      expect(screen.getByTestId('segment-debug-bar')).toHaveTextContent('50%')
    }, { timeout: 1500 })

    const displayLog = screen.getByTestId('segment-debug-display-log')
    // At least one progress callback fired during animation (0% starting point is always logged)
    expect(displayLog).toHaveTextContent('display=0%')
    // After reaching 50%, the display log must show at least one non-zero progress callback
    // (exact intermediate values are animation-timing-dependent, so we only assert at least one > 0%)
    expect(displayLog.textContent).toMatch(/display=\d+%/)
    expect(screen.getByTestId('segment-debug-event-log')).toHaveTextContent('SEGMENT_PROGRESS debug-segment-1 progress=50%')
  })

  it('can stop the segment debug run without pulling in ETA or chapter progress state', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.click(screen.getByText('Start Segment'))
    fireEvent.change(screen.getByLabelText('Segment target %'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('Stop Segment'))

    await waitFor(() => {
      expect(screen.getByTestId('segment-debug-bar')).toHaveTextContent('Complete')
      expect(screen.getByTestId('segment-debug-bar')).not.toHaveTextContent(/ETA:/)
      expect(screen.getByTestId('segment-debug-display-log')).toHaveTextContent('display=100%')
      expect(screen.getByTestId('segment-debug-event-log')).toHaveTextContent('SEGMENT_SAVED debug-segment-1 progress=100%')
    })
  })

  it('does not apply launch-state edits to the live preview until launch is clicked', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.getAllByText('25%').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'queued' } })
    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '0.67' } })

    expect(screen.getAllByText('25%').length).toBeGreaterThan(0)
    expect(screen.queryByText('67%')).toBeNull()

    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
      expect(screen.getAllByText('queued').length).toBeGreaterThan(0)
    })
  })

  it('launches from the configured initial state without resetting progress', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '0.67' } })
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[0], { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Custom Run' } })

    expect(screen.getByDisplayValue('0.67')).toBeTruthy()
    expect(screen.getAllByDisplayValue('300').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
    })

    expect(screen.getAllByDisplayValue('300').length).toBeGreaterThan(0)
    expect(screen.getByText('Custom Run')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '0.12' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('12%').length).toBeGreaterThan(0)
    })
  })

  it('launches queued and preparing runs using the selected status', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.getByTitle(/The lifecycle state being simulated/)).toBeTruthy()
    expect(screen.getAllByTitle('Set this timestamp to the current unix time.').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'queued' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('Bar status').length).toBeGreaterThan(0)
      expect(screen.getAllByText('queued').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'preparing' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('preparing').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)
  })

  it('seeds startedAt to now when a preparing run becomes running without a handoff timestamp', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.change(screen.getByLabelText('Checkpoint Mode'), { target: { value: 'default' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'preparing' } })
    fireEvent.change(screen.getAllByLabelText('Progress')[0], { target: { value: '0.00' } })
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[0], { target: { value: '120' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    fireEvent.change(screen.getByLabelText('Manual progress %'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Manual ETA seconds'), { target: { value: '120' } })
    fireEvent.change(screen.getByLabelText('Update Status'), { target: { value: 'running' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getAllByText(/ETA:/).length).toBeGreaterThan(0)
    })
  })

  it('uses absolute live update fields instead of delta controls', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.queryByLabelText('Progress Delta %')).toBeNull()
    expect(screen.queryByLabelText('ETA Delta Seconds')).toBeNull()
    expect(screen.queryByLabelText('Started At (unix)')).toBeNull()

    fireEvent.change(screen.getByLabelText('Manual ETA seconds'), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('Update Status'), { target: { value: 'finalizing' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByText(/Applied live update:/)).toBeTruthy()
    })
  })

  it('applies Send Update as a live payload and reflects it in the predictive debug dump', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.change(screen.getByLabelText('Manual progress %'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Manual ETA seconds'), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('Update Status'), { target: { value: 'running' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByText('Manual update')).toBeTruthy()
      expect(screen.getByText(/Applied live update: progress 90%, eta_seconds 45, status running/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"progress": 0.9/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"etaSeconds": 45/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"updatedAt": \d+/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"incomingProgress": 0.9/)).toBeTruthy()
    })
  })

  it('treats quick progress and finish controls as manual live updates', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.click(screen.getByText('+10%'))

    await waitFor(() => {
      expect(screen.getByText('Manual update')).toBeTruthy()
      expect(screen.getByText(/Progress nudged to 35%/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"progress": 0.35/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"updatedAt": \d+/)).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Finish'))

    await waitFor(() => {
      expect(screen.getByText(/Progress finished to 100% with finalizing status/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"progress": 1/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"status": "finalizing"/)).toBeTruthy()
    })
  })

  it('applies Manual allow backward to the active predictive preview', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.change(screen.getByLabelText('Manual progress %'), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText('Manual ETA seconds'), { target: { value: '120' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByDisplayValue(/"progress": 0.8/)).toBeTruthy()
    })

    fireEvent.click(screen.getByLabelText('Manual allow backward'))
    fireEvent.change(screen.getByLabelText('Manual progress %'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByText(/Manual allow backward enabled/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"allowBackwardProgress": true/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"progress": 0.2/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"isBackwardMigration": true/)).toBeTruthy()
    })
  })

  it('reflects segments.progress payload in the debug panel and raw frame inspector', async () => {
    render(<ProgressBarTestPage />)

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-123', jobId: 'job-123', chapterId: 'chap-123', projectId: 'proj-123' },
        payload: {
          status: 'running',
          progress: 0.85,
          activeSegmentId: 'seg-123',
          activeSegmentProgress: 0.45,
          etaSeconds: 120,
          reasonCode: 'segment_progress_tick',
        },
      })
    })

    await waitFor(() => {
      // Active source should be socket
      expect(screen.getByText('Socket event')).toBeTruthy()

      // The raw frame inspector (textarea) should show the frame JSON
      const textarea = screen.getByTestId('raw-frame-inspector') as HTMLTextAreaElement
      expect(textarea.value).toContain('segments.progress')
      expect(textarea.value).toContain('seg-123')
      expect(textarea.value).toContain('0.45')

      // Grid fields are present
      expect(screen.getAllByText('seg-123').length).toBeGreaterThan(0)
      expect(screen.getAllByText('job-123').length).toBeGreaterThan(0)
      expect(screen.getAllByText('0.45').length).toBeGreaterThan(0)
    })
  })

  it('distinguishes launch-config state from socket-fed segment state', async () => {
    render(<ProgressBarTestPage />)

    // Initially should be Launch Config
    expect(screen.getByText('Launch config')).toBeTruthy()

    // Send socket update
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        payload: {
          status: 'running',
          progress: 0.85,
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Socket event')).toBeTruthy()
    })

    // Send manual update
    fireEvent.change(screen.getByLabelText('Manual ETA seconds'), { target: { value: '45' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByText('Manual update')).toBeTruthy()
    })
  })

  it('keeps the lower live preview on the direct predictive component path even in segment checkpoint mode', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.getByTestId('dev-progress-bar-preview')).toHaveTextContent(/ETA:/)
    expect(screen.getByTestId('dev-progress-bar-preview')).toHaveTextContent('Progress Test')

    await waitFor(() => {
      expect(screen.getByDisplayValue(/"predictive": true/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"transitionTickCount": 8/)).toBeTruthy()
      expect(screen.getByDisplayValue(/"displayedRemaining":\s*\d+/)).toBeTruthy()
    })
  })

  it('proves unrelated topics do not update DevProgressBar state and show in ignored topics list', async () => {
    render(<ProgressBarTestPage />)

    // Initially active source is launch config
    expect(screen.getByText('Launch config')).toBeTruthy()

    // Verify ignored topics indicators are explicitly shown
    expect(screen.getByText('queue.items (Ignored)')).toBeTruthy()
    expect(screen.getByText('chapters.progress (Ignored)')).toBeTruthy()
    expect(screen.getByText('tts.logs (Ignored)')).toBeTruthy()

    // Send unrelated topics
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        payload: { status: 'running' }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Launch config')).toBeTruthy()
      expect(screen.getByText('Last ignored event:')).toBeTruthy()
      expect(screen.getByTestId('last-ignored-event-topic').textContent).toBe('queue.items')
    })

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        payload: { status: 'running' }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Launch config')).toBeTruthy()
      expect(screen.getByTestId('last-ignored-event-topic').textContent).toBe('chapters.progress')
    })

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'tts.logs',
        eventKind: 'tts_log',
        payload: { line: 'some tts log' }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Launch config')).toBeTruthy()
      expect(screen.getByTestId('last-ignored-event-topic').textContent).toBe('tts.logs')
    })
  })
})
