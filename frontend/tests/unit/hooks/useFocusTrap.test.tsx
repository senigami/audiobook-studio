import { render, screen, fireEvent } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { useFocusTrap } from '@/hooks/useFocusTrap'

// A simple test harness that renders a dialog-like container with two buttons
function FocusTrapHarness({ isOpen }: { isOpen: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, isOpen)
  return (
    <div>
      <button data-testid="trigger">Trigger outside</button>
      {isOpen && (
        <div ref={ref} data-testid="trap">
          <button data-testid="first">First</button>
          <button data-testid="second">Second</button>
        </div>
      )}
    </div>
  )
}

function ToggleHarness() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open)
  return (
    <div>
      <button data-testid="opener" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div ref={ref} data-testid="trap">
          <button data-testid="close" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  )
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element when isOpen becomes true', () => {
    const { container } = render(<FocusTrapHarness isOpen={true} />)
    const first = container.querySelector('[data-testid="first"]') as HTMLElement
    expect(document.activeElement).toBe(first)
  })

  it('wraps Tab from last element back to first', () => {
    const { container } = render(<FocusTrapHarness isOpen={true} />)
    const second = container.querySelector('[data-testid="second"]') as HTMLElement
    second.focus()
    expect(document.activeElement).toBe(second)

    fireEvent.keyDown(document, { key: 'Tab', bubbles: true })
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="first"]')
    )
  })

  it('wraps Shift+Tab from first element back to last', () => {
    const { container } = render(<FocusTrapHarness isOpen={true} />)
    const first = container.querySelector('[data-testid="first"]') as HTMLElement
    first.focus()
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true, bubbles: true })
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="second"]')
    )
  })

  it('restores focus to the element that was focused before opening', () => {
    const { container, rerender } = render(<ToggleHarness />)
    const opener = container.querySelector('[data-testid="opener"]') as HTMLElement
    opener.focus()
    expect(document.activeElement).toBe(opener)

    // Open
    fireEvent.click(opener)
    // The trap is now open; activeElement should have shifted to "close"
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="close"]')
    )

    // Close — focus should return to the opener
    fireEvent.click(container.querySelector('[data-testid="close"]') as HTMLElement)
    // After close, rerender with isOpen=false happens via state
    expect(document.activeElement).toBe(opener)
  })
})
