import { render, screen, fireEvent } from '@testing-library/react'
import { Switch } from '@/components/ui/Switch'
import { describe, it, expect, vi } from 'vitest'

describe('Switch', () => {
  it('renders with role="switch" and correct aria-checked when off', () => {
    render(<Switch checked={false} onChange={vi.fn()} label="Dark mode" />)
    const btn = screen.getByRole('switch', { name: 'Dark mode' })
    expect(btn.getAttribute('aria-checked')).toBe('false')
  })

  it('renders with aria-checked="true" when checked', () => {
    render(<Switch checked={true} onChange={vi.fn()} label="Dark mode" />)
    const btn = screen.getByRole('switch', { name: 'Dark mode' })
    expect(btn.getAttribute('aria-checked')).toBe('true')
  })

  it('calls onChange with toggled value on click', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Feature" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when currently checked', () => {
    const onChange = vi.fn()
    render(<Switch checked={true} onChange={onChange} label="Feature" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Feature" disabled />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('has switch--off class when unchecked', () => {
    const { container } = render(<Switch checked={false} onChange={vi.fn()} />)
    expect(container.firstChild).toHaveClass('switch--off')
  })

  it('has switch--on class when checked', () => {
    const { container } = render(<Switch checked={true} onChange={vi.fn()} />)
    expect(container.firstChild).toHaveClass('switch--on')
  })
})
