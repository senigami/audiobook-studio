import { render, screen } from '@testing-library/react'
import { Layout } from './Layout'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { createStudioShellState } from '../app/layout/StudioShell'

describe('Layout', () => {
    const defaultProps = {
        children: <div>Content</div>,
    }

    it('renders the correct branding text', () => {
        render(
            <MemoryRouter>
                <Layout {...defaultProps} />
            </MemoryRouter>
        )

        expect(screen.getByText(/AUDIOBOOK/i)).toBeTruthy()
        expect(screen.getByText(/STUDIO/i)).toBeTruthy()
        expect(screen.getByLabelText(/Audiobook Studio/i)).toBeTruthy()
    })

    it('renders navigation tabs', () => {
        render(
            <MemoryRouter>
                <Layout {...defaultProps} />
            </MemoryRouter>
        )

        expect(screen.getByText(/Voices/i)).toBeTruthy()
        expect(screen.getByText(/Queue/i)).toBeTruthy()
        expect(screen.getByText(/Library/i)).toBeTruthy()
    })

    it('uses shell state to keep project surfaces mapped to the visible library tab', () => {
        const shellState = createStudioShellState({
            pathname: '/project/p123',
            loading: false,
            connected: true,
            isReconnecting: false,
        })

        render(
            <MemoryRouter>
                <Layout {...defaultProps} shellState={shellState} />
            </MemoryRouter>
        )

        expect(screen.getByRole('button', { name: /Library/i })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'ready')
    })

    it('reports transient hydration status in the DOM', () => {
        const shellState = createStudioShellState({
            pathname: '/',
            loading: false,
            connected: true,
            isReconnecting: false,
            hydrationSource: 'refresh'
        })

        render(
            <MemoryRouter>
                <Layout {...defaultProps} shellState={shellState} />
            </MemoryRouter>
        )

        expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'refreshing')
    })

    it('reports reconnecting status in the DOM', () => {
        const shellState = createStudioShellState({
            pathname: '/',
            loading: false,
            connected: false,
            isReconnecting: true
        })

        render(
            <MemoryRouter>
                <Layout {...defaultProps} shellState={shellState} />
            </MemoryRouter>
        )

        expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'reconnecting')
    })
})
