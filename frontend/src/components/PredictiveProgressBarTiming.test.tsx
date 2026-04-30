import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from './PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'
import { parseTime, readPercent } from './PredictiveProgressBarTestHelpers'

describe('PredictiveProgressBar - Timing', () => {
    it('calculates ETA using elapsed time', () => {
        const now = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(now)
        render(
            <PredictiveProgressBar 
                progress={0.10} 
                startedAt={(now / 1000) - 10} 
                etaSeconds={100} 
                label="Proc" 
                status="running"
            />
        )
        expect(screen.getByText(/ETA: 1:30/i)).toBeTruthy()
        vi.restoreAllMocks()
    })

    it('auto-flips a running bar to finalizing when the eta is exhausted', () => {
        vi.useFakeTimers()
        vi.setSystemTime(127_000)
        render(
            <PredictiveProgressBar
                progress={0.996}
                startedAt={1}
                etaSeconds={120}
                label="Fin"
                status="running"
                showEta={false}
            />
        )
        expect(screen.getByText('Finalizing...')).toBeTruthy()
        vi.useRealTimers()
    })

    it('does not increase ETA unless a new prop update gives a later endAtMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.5} 
                startedAt={50}
                etaSeconds={100}
                status="running" 
            />
        )
        const initialS = parseTime(screen.getByText(/ETA:/).textContent)
        act(() => { vi.advanceTimersByTime(10000) })
        const advancedS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(advancedS).toBeLessThan(initialS)
        rerender(
            <PredictiveProgressBar 
                progress={0.6} 
                startedAt={50}
                etaSeconds={100}
                status="running" 
            />
        )
        const rerenderedS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(rerenderedS).toBe(advancedS)
        vi.useRealTimers()
    })

    it('increases ETA when a new prop update gives a later endAtMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.5} 
                startedAt={50}
                etaSeconds={100}
                status="running" 
            />
        )
        const beforeS = parseTime(screen.getByText(/ETA:/).textContent)
        rerender(
            <PredictiveProgressBar 
                progress={0.5} 
                startedAt={50}
                etaSeconds={200}
                status="running" 
            />
        )
        const afterS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(afterS).toBeGreaterThan(beforeS)
        vi.useRealTimers()
    })

    it('triggers predictive movement for running 0.0 jobs as soon as an ETA is provided', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now)
        const { container } = render(
            <PredictiveProgressBar 
                progress={0} 
                status="running" 
                showEta={true}
                etaSeconds={100}
                updatedAt={now / 1000}
                tickMs={250}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill().style.width).toBe('0%')
        
        act(() => {
            vi.advanceTimersByTime(10000) // 10 seconds
        })
        
        expect(readPercent()).toBe(10)
        vi.useRealTimers()
    })

    it('starts resumed jobs from authoritative backend progress instead of jumping ahead on mount', () => {
        vi.useFakeTimers()
        vi.setSystemTime(91_000)
        render(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
            />
        )
        expect(screen.getByText('25%')).toBeTruthy()
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(screen.getByText(/2[5-9]%|3[0-9]%/)).toBeTruthy()
        vi.useRealTimers()
    })
})
