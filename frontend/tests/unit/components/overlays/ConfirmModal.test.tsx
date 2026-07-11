import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmModal } from '@/components/overlays/ConfirmModal'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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

  it('X button hit area is at least 40×40px via padding', () => {
    render(<ConfirmModal {...baseProps()} />)
    const closeBtn = screen.getByLabelText('Close dialog') as HTMLElement
    // min-width/min-height (40px) and padding (10px) live on the .modal-close-btn CSS class (P5).
    // jsdom in this project doesn't process the theme stylesheet (no `css: true` in
    // vitest.config.ts), so read the source rule directly rather than asserting computed style.
    expect(closeBtn.classList.contains('modal-close-btn')).toBe(true)

    const cssPath = resolve(process.cwd(), 'src/theme/components/misc.css')
    const css = readFileSync(cssPath, 'utf-8')
    const rule = css.match(/\.modal-close-btn\s*\{[^}]*\}/)?.[0]
    expect(rule).toBeTruthy()
    expect(rule).toMatch(/min-width:\s*40px/)
    expect(rule).toMatch(/min-height:\s*40px/)
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
