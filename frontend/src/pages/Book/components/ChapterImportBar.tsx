import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { useDragDropHighlight } from '@/hooks/useDragDropHighlight';

type ImportFilesHandler = (files: FileList | File[] | null | undefined) => void | Promise<void>;

interface ChapterImportBarProps {
  onImportFiles: ImportFilesHandler;
  submitting: boolean;
  compact?: boolean;
}

export function ChapterImportBar({
  onImportFiles,
  submitting,
  compact = false,
}: ChapterImportBarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFiles: ImportFilesHandler = async (files) => {
    await onImportFiles(files);
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  const { isDragging, dragDropProps } = useDragDropHighlight(handleImportFiles);

  if (compact) {
    return (
      <div
        style={{
          flex: '1 1 280px',
          minWidth: 0,
          maxWidth: '320px',
          marginRight: 'auto',
        }}
      >
        <input
          ref={importInputRef}
          type="file"
          multiple
          accept=".txt"
          className="sr-only"
          aria-label="Import manuscript file"
          onChange={(event) => void handleImportFiles(event.target.files)}
        />
        <button
          type="button"
          aria-label={isDragging ? 'Import manuscript, release to import files' : 'Import manuscript, browse or drop files'}
          onClick={() => importInputRef.current?.click()}
          disabled={submitting}
          className="btn-ghost"
          {...dragDropProps}
          style={{
            width: '100%',
            minHeight: '42px',
            padding: '0.45rem 0.85rem',
            borderRadius: 'var(--radius-panel)',
            border: `1px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
            background: isDragging ? 'var(--accent-glow)' : 'var(--surface)',
            color: isDragging ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            textAlign: 'left',
            whiteSpace: 'nowrap',
          }}
        >
          <Upload size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <strong style={{ fontSize: '0.85rem', lineHeight: 1.2, fontWeight: 700 }}>
            {isDragging ? 'Release to import' : 'Import manuscript'}
          </strong>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'inherit',
              opacity: 0.85,
            }}
          >
            {isDragging ? 'Release' : 'Browse'}
          </span>
          {isDragging && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                border: '2px solid var(--accent)',
                background: 'rgba(var(--accent-rgb), 0.06)',
                pointerEvents: 'none',
              }}
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="manuscript-stage__import-row"
      style={{
        width: '100%',
        maxWidth: compact ? '760px' : '100%',
        alignSelf: compact ? 'flex-start' : 'stretch',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <strong>Import manuscript file</strong>
        <span>.txt only</span>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          flex: compact ? '0 1 auto' : '1 1 360px',
          minWidth: 0,
        }}
      >
        <input
          ref={importInputRef}
          type="file"
          multiple
          accept=".txt"
          className="sr-only"
          aria-label="Import manuscript file"
          onChange={(event) => void handleImportFiles(event.target.files)}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => importInputRef.current?.click()}
          disabled={submitting}
        >
          Choose file
        </button>
        <button
          type="button"
          aria-label="Drop manuscript files"
          onClick={() => importInputRef.current?.click()}
          disabled={submitting}
          className="btn-ghost"
          {...dragDropProps}
          style={{
            flex: compact ? '0 0 180px' : '1 1 260px',
            minHeight: compact ? '48px' : '72px',
            padding: compact ? '0.55rem 0.75rem' : '0.85rem 1rem',
            borderRadius: 'var(--radius-panel)',
            border: `1px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
            background: isDragging ? 'var(--accent-glow)' : 'var(--surface)',
            color: isDragging ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: compact ? '0.65rem' : '0.85rem',
            textAlign: 'left',
          }}
        >
          <Upload size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
            <strong style={{ fontSize: compact ? '0.82rem' : '0.9rem', lineHeight: 1.2 }}>
              {isDragging ? 'Drop to import' : 'Drop files here'}
            </strong>
            <span style={{ fontSize: compact ? '0.7rem' : '0.78rem', color: 'inherit', opacity: 0.85 }}>
              {isDragging ? 'Release to add the manuscript files' : 'Drag and drop .txt files'}
            </span>
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: compact ? '0.68rem' : '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'inherit',
            }}
          >
            {isDragging ? 'Release' : 'Browse'}
          </span>
          {isDragging && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                border: '2px solid var(--accent)',
                background: 'rgba(var(--accent-rgb), 0.06)',
                pointerEvents: 'none',
              }}
            />
          )}
        </button>
      </div>
    </div>
  );
}
