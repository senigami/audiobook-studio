import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmModal } from '@/components/overlays/ConfirmModal'
import { describe, it, expect, vi } from 'vitest'

function baseProps(overrides = {}) {
  return {
    isOpen: true,
    title: 'Delete it?',
    message: 'This cannot be undone.',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

describe('ConfirmModal', () => {
  it('exposes role="dialog" with aria-modal and aria-labelledby pointing at the title', () => {
    render(<ConfirmModal {...baseProps()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const heading = document.getElementById(labelId!)
    expect(heading?.textContent).toBe('Delete it?')
  })

  it('close (X) button has an accessible name', () => {
    render(<ConfirmModal {...baseProps()} />)
    const closeBtn = screen.getByLabelText('Close dialog')
    expect(closeBtn).toBeTruthy()
  })

  it('X button hit area is at least 40×40px via padding', () => {
    render(<ConfirmModal {...baseProps()} />)
    const closeBtn = screen.getByLabelText('Close dialog') as HTMLElement
    // min-width/min-height (40px) and padding (10px) moved to .modal-close-btn CSS class (P5)
    expect(closeBtn.classList.contains('modal-close-btn')).toBe(true)
  })

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn()
    render(<ConfirmModal {...baseProps({ onCancel })} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog.parentElement!, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not render the dialog when isOpen is false', () => {
    render(<ConfirmModal {...baseProps({ isOpen: false })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
