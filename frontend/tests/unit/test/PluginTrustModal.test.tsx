import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { PluginTrustModal } from '@/components/overlays/PluginTrustModal';

const basePreview = {
  engine_id: 'myplugin',
  display_name: 'My Plugin',
  version: '1.2.3',
  requirements: ['torch>=2.0', 'numpy'],
};

describe('PluginTrustModal', () => {
  it('renders engine metadata', () => {
    render(
      <PluginTrustModal
        isOpen={true}
        preview={basePreview}
        mode="import"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('My Plugin')).toBeTruthy();
    expect(screen.getByText('myplugin')).toBeTruthy();
    expect(screen.getByText('v1.2.3')).toBeTruthy();
  });

  it('renders all dependency lines', () => {
    render(
      <PluginTrustModal
        isOpen={true}
        preview={basePreview}
        mode="import"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('torch>=2.0')).toBeTruthy();
    expect(screen.getByText('numpy')).toBeTruthy();
  });

  it('highlights remote dependency lines with REMOTE badge', () => {
    const preview = {
      ...basePreview,
      requirements: ['numpy', 'git+https://github.com/example/repo.git'],
    };
    render(
      <PluginTrustModal
        isOpen={true}
        preview={preview}
        mode="import"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const remoteBadges = screen.getAllByText('REMOTE');
    expect(remoteBadges.length).toBe(1);
  });

  it('does NOT call onConfirm when Cancel is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PluginTrustModal
        isOpen={true}
        preview={basePreview}
        mode="import"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm ONLY when Install Plugin is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <PluginTrustModal
        isOpen={true}
        preview={basePreview}
        mode="import"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Install Plugin'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses "Install Dependencies" label in install-deps mode', () => {
    render(
      <PluginTrustModal
        isOpen={true}
        preview={basePreview}
        mode="install-deps"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('Install Dependencies')).toBeTruthy();
  });

  it('shows "None declared." when requirements are empty', () => {
    render(
      <PluginTrustModal
        isOpen={true}
        preview={{ ...basePreview, requirements: [] }}
        mode="import"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('None declared.')).toBeTruthy();
  });

  it('does not render when isOpen is false', () => {
    render(
      <PluginTrustModal
        isOpen={false}
        preview={basePreview}
        mode="import"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('My Plugin')).toBeNull();
  });
});
