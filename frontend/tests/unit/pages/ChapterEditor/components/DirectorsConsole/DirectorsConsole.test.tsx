import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectorsConsole } from '@/pages/ChapterEditor/components/DirectorsConsole';
import { useDirtyGuard } from '@/pages/ChapterEditor/components/DirectorsConsole/DirtyGuardContext';

// ConfirmModal uses AnimatePresence — mock it with a synchronous stub so the
// dirty-exit guard tests below aren't flaky waiting on an exit animation.
// Same pattern as tests/unit/pages/Book/ChapterTable.test.tsx.
vi.mock('@/components/overlays/ConfirmModal', () => ({
  ConfirmModal: ({ isOpen, title, message, onConfirm, onCancel, confirmText, cancelText = 'Cancel' }: any) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h3 id="confirm-modal-title">{title}</h3>
        <p>{message}</p>
        <button type="button" onClick={onCancel}>{cancelText}</button>
        <button type="button" onClick={onConfirm}>{confirmText}</button>
      </div>
    );
  },
}));

// CastTool's body is now a real (zero-prop) port of StudioStage.tsx that
// resolves chapter/book context via useSearchParams()/useBookDataContext()
// (see design-docs/plans/active/directors_console_activation/tasks/003-cast-tool.md).
// DirectorsConsole itself is not wrapped in a Router/BookDataProvider here —
// this suite is only about the tool-rail switching behavior, not Cast's
// internals (covered by CastTool/CastTool.test.tsx), so stub Cast's body
// out with a lightweight marker to keep this test isolated to the console.
//
// The mock body also exposes a "Make dirty" button wired to the real (not
// mocked) DirtyGuardContext so the dirty-exit guard tests below can drive
// it exactly the way a real tool body (WriteTool/ReviseTool) would.
function CastToolMockBody() {
  const { setDirty } = useDirtyGuard();
  return (
    <div data-testid="cast-tool-mock">
      Cast tool body (real, tested separately)
      <button type="button" onClick={() => setDirty(true, 'Unsaved cast change')}>
        Make dirty
      </button>
    </div>
  );
}

vi.mock('@/pages/ChapterEditor/components/DirectorsConsole/CastTool', () => ({
  CastTool: {
    id: 'cast',
    label: 'Cast',
    icon: (props: any) => <svg data-testid="cast-icon-mock" {...props} />,
    component: CastToolMockBody,
    shortcut: 'V',
    demoPlaceholder: false,
  },
}));

describe('DirectorsConsole', () => {
  it('includes the three core tools and the future-slot placeholders', () => {
    render(<DirectorsConsole />);

    ['Cast', 'Booth', 'Revise'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });

    ['Casting Call', 'Script Supervisor', 'Plugin'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  it('shows the first tool\'s (Cast) body by default', () => {
    render(<DirectorsConsole />);

    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('[data-testid="cast-tool-mock"]')).toBeInTheDocument();
  });

  it('switches the active tool body when a different rail icon is clicked', async () => {
    const user = userEvent.setup();
    render(<DirectorsConsole />);

    // Cast/Booth/Revise are all real ports now (Tasks 003/004/005 —
    // *Tool.test.tsx cover their internals), so use a still-stub demo
    // placeholder slot as the "coming soon" fixture here instead.
    await user.click(screen.getByRole('tab', { name: 'Casting Call' }));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Casting Call');
    expect(panel).toHaveTextContent('Coming soon');
    expect(screen.getByRole('tab', { name: 'Casting Call' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Cast' })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows the "coming soon" stub for a placeholder slot when selected', async () => {
    const user = userEvent.setup();
    render(<DirectorsConsole />);

    await user.click(screen.getByRole('tab', { name: 'Script Supervisor' }));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Script Supervisor');
    expect(panel).toHaveTextContent('Coming soon');
  });

  // Booth/Revise/Write are real ports that need Router + BookDataProvider
  // context DirectorsConsole isn't wrapped in here (this suite is scoped to
  // the rail-switching mechanism, not those tools' internals — see the
  // comment on the CastTool mock above). The "Casting Call"/"Script
  // Supervisor" placeholder slots are context-free stubs, so they're used
  // as the switch-target tabs below instead.
  describe('dirty-exit guard', () => {
    it('switches tabs immediately with no confirm prompt when the active tool is not dirty', async () => {
      const user = userEvent.setup();
      render(<DirectorsConsole />);

      await user.click(screen.getByRole('tab', { name: 'Casting Call' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Casting Call' })).toHaveAttribute('aria-selected', 'true');
    });

    it('shows a confirm dialog when switching tabs while the active tool reports dirty state', async () => {
      const user = userEvent.setup();
      render(<DirectorsConsole />);

      await user.click(screen.getByRole('button', { name: 'Make dirty' }));
      await user.click(screen.getByRole('tab', { name: 'Casting Call' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveTextContent(/unsaved changes in cast/i);
      // The tool hasn't actually switched yet — Cast is still active.
      expect(screen.getByRole('tab', { name: 'Cast' })).toHaveAttribute('aria-selected', 'true');
    });

    it('canceling the confirm dialog keeps the current tab active', async () => {
      const user = userEvent.setup();
      render(<DirectorsConsole />);

      await user.click(screen.getByRole('button', { name: 'Make dirty' }));
      await user.click(screen.getByRole('tab', { name: 'Casting Call' }));
      await user.click(screen.getByRole('button', { name: 'Stay' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Cast' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Casting Call' })).toHaveAttribute('aria-selected', 'false');
    });

    it('confirming the dialog switches to the pending tab', async () => {
      const user = userEvent.setup();
      render(<DirectorsConsole />);

      await user.click(screen.getByRole('button', { name: 'Make dirty' }));
      await user.click(screen.getByRole('tab', { name: 'Casting Call' }));
      await user.click(screen.getByRole('button', { name: 'Switch tabs' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Casting Call' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Cast' })).toHaveAttribute('aria-selected', 'false');
    });

    it('resets the dirty flag after a confirmed switch, so the next switch is prompt-free', async () => {
      const user = userEvent.setup();
      render(<DirectorsConsole />);

      await user.click(screen.getByRole('button', { name: 'Make dirty' }));
      await user.click(screen.getByRole('tab', { name: 'Casting Call' }));
      await user.click(screen.getByRole('button', { name: 'Switch tabs' }));

      await user.click(screen.getByRole('tab', { name: 'Script Supervisor' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Script Supervisor' })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
