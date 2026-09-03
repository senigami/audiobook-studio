import { render, screen } from '@testing-library/react'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { describe, it, expect } from 'vitest'

describe('BrandLogo', () => {
    it('has the correct accessibility label', () => {
        render(<BrandLogo />)
        expect(screen.getByLabelText(/Audiobook Studio/i)).toBeTruthy()
    })

    it('renders the icon when showIcon is true', () => {
        const { container } = render(<BrandLogo showIcon={true} />)
        const img = container.querySelector('img')
        expect(img).toBeTruthy()
        expect(img?.getAttribute('src')).toBe('/logo.png')
    })

    it('does not render the icon when showIcon is false', () => {
        const { container } = render(<BrandLogo showIcon={false} />)
        const img = container.querySelector('img')
        expect(img).toBeNull()
    })
})
