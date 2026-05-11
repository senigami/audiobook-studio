import { act, screen } from '@testing-library/react'
import { vi } from 'vitest'

export const readPercent = () => {
    const matches = screen.getAllByText(/\d+%/)
    return Number.parseInt(matches[0].textContent || '0', 10)
}

export const advanceInTicks = (ms: number, tickMs = 250) => {
    for (let elapsed = 0; elapsed < ms; elapsed += tickMs) {
        act(() => {
            vi.advanceTimersByTime(Math.min(tickMs, ms - elapsed))
        })
    }
}

export function parseTime(t: string | null) {
    const m = t?.match(/(\d+):(\d+)/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}
