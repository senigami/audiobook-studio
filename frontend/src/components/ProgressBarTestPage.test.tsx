import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressBarTestPage } from './ProgressBarTestPage'

describe('ProgressBarTestPage', () => {
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

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'preparing' } })
    fireEvent.change(screen.getAllByLabelText('Progress')[0], { target: { value: '0.00' } })
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[0], { target: { value: '120' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    fireEvent.change(screen.getAllByRole('slider')[1], { target: { value: '1' } })
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[1], { target: { value: '120' } })
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

    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[1], { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('Update Status'), { target: { value: 'finalizing' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByText(/Applied live update:/)).toBeTruthy()
    })
  })
})
