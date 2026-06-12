import { render, screen, fireEvent } from '@testing-library/react'
import { Layout } from '@/components/layout/Layout'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { createStudioShellState } from '@/app/layout/StudioShell'

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
        expect(screen.getByText(/Settings/i)).toBeTruthy()
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

    it('renders the queue count badge even during hydration', () => {
        const shellState = createStudioShellState({
            pathname: '/',
            loading: false,
            connected: true,
            isReconnecting: false,
            hydrationSource: 'reconnect'
        })

        render(
            <MemoryRouter>
                <Layout {...defaultProps} queueCount={5} shellState={shellState} />
            </MemoryRouter>
        )

        // The 'Queue' text should have a badge with '5'
        expect(screen.getByText('Queue')).toBeTruthy()
        expect(screen.getByText('5')).toBeTruthy()
        expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'recovering')
    })

    it('burger button toggles nav open state', () => {
        render(
            <MemoryRouter>
                <Layout {...defaultProps} />
            </MemoryRouter>
        )

        const burger = screen.getByRole('button', { name: /Open navigation/i })
        expect(burger.getAttribute('aria-expanded')).toBe('false')

        // Open
        fireEvent.click(burger)
        expect(burger.getAttribute('aria-expanded')).toBe('true')

        // Close
        fireEvent.click(burger)
        expect(burger.getAttribute('aria-expanded')).toBe('false')
    })

    it('mobile nav backdrop click closes the drawer', () => {
        render(
            <MemoryRouter>
                <Layout {...defaultProps} />
            </MemoryRouter>
        )

        // Open drawer
        const burger = screen.getByRole('button', { name: /Open navigation/i })
        fireEvent.click(burger)
        expect(burger.getAttribute('aria-expanded')).toBe('true')

        // Backdrop should now be present
        const backdrop = document.querySelector('.mobile-nav-backdrop')
        expect(backdrop).toBeTruthy()

        // Clicking backdrop closes drawer
        fireEvent.click(backdrop!)
        expect(burger.getAttribute('aria-expanded')).toBe('false')

        // Backdrop should no longer be in DOM
        expect(document.querySelector('.mobile-nav-backdrop')).toBeNull()
    })

    it('uses shell state to mark settings as the active global tab', () => {
        const shellState = createStudioShellState({
            pathname: '/settings/engines',
            loading: false,
            connected: true,
            isReconnecting: false,
        })

        render(
            <MemoryRouter>
                <Layout {...defaultProps} shellState={shellState} />
            </MemoryRouter>
        )

        expect(screen.getByRole('button', { name: /Settings/i })).toHaveAttribute('aria-current', 'page')
    })
})
