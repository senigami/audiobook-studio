import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, RefreshCw, Zap } from 'lucide-react';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useDevMode } from '@/utils/devMode';

interface StudioHeaderActionsProps {
  hasUnsavedChanges: boolean;
  onCommitChanges: () => void;
  onPrev?: () => void | Promise<void>;
  onNext?: () => void | Promise<void>;
  onExportAudio: (format: 'wav' | 'mp3') => void | Promise<void>;
  exportingFormat?: 'wav' | 'mp3' | null;
  onCopyDebugState?: () => void | Promise<void>;
}

export function StudioHeaderActions({
  hasUnsavedChanges,
  onCommitChanges,
  onPrev,
  onNext,
  onExportAudio,
  exportingFormat = null,
  onCopyDebugState,
}: StudioHeaderActionsProps) {
  const devMode = useDevMode();

  const exportItems = useMemo(() => ([
    {
      label: 'WAV',
      icon: Download,
      onClick: () => onExportAudio('wav'),
    },
    {
      label: 'MP3',
      icon: Download,
      onClick: () => onExportAudio('mp3'),
    },
  ]), [onExportAudio]);

  const exportTrigger = (
    <span className="studio-header-actions__export-trigger">
      {exportingFormat ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
      <span>
        {exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}…` : 'Export ▾'}
      </span>
    </span>
  );

  return (
    <div className="studio-header-actions" aria-label="Chapter navigation actions">
      {hasUnsavedChanges && (
        <span className="studio-header-actions__chip">
          Unsaved text changes
        </span>
      )}

      {hasUnsavedChanges && (
        <button
          type="button"
          className="studio-header-actions__commit"
          onClick={onCommitChanges}
          title="Preview how the current text changes will re-analyze"
        >
          <Zap size={14} />
          Commit changes
        </button>
      )}

      <div className="studio-header-actions__nav" role="group" aria-label="Chapter navigation">
        <button
          type="button"
          className="studio-header-actions__nav-btn studio-header-actions__nav-btn--prev"
          onClick={onPrev}
          disabled={!onPrev}
          title="Save current chapter and go to the previous chapter"
        >
          <ChevronLeft size={14} />
          <span>Save &amp; prev</span>
        </button>
        <button
          type="button"
          className="studio-header-actions__nav-btn studio-header-actions__nav-btn--next"
          onClick={onNext}
          disabled={!onNext}
          title="Save current chapter and go to the next chapter"
        >
          <span>Save &amp; next</span>
          <ChevronRight size={14} />
        </button>
      </div>

      <ActionMenu
        items={exportItems}
        trigger={exportTrigger}
        disabled={Boolean(exportingFormat)}
      />

      {onCopyDebugState && devMode && (
        <button
          type="button"
          className="studio-header-actions__debug"
          onClick={onCopyDebugState}
          title="Copy debug state"
        >
          <Copy size={14} />
          Debug
        </button>
      )}
    </div>
  );
}
