import React from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';

export const ChapterTopBar: React.FC<{
  title?: string;
  setTitle?: (title: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSaveWav?: () => void;
  onSaveMp3?: () => void;
  exportingFormat?: 'wav' | 'mp3' | null;
}> = ({
  title, setTitle, onPrev, onNext, onSaveWav, onSaveMp3, exportingFormat
}) => {
  const [exportOpen, setExportOpen] = React.useState(false);

  return (
    <header className="chapter-header" style={{
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 0',
      background: 'var(--bg)', flexShrink: 0, width: '100%'
    }}>
      <div className="chapter-header__nav" style={{ display: 'flex', gap: '0.35rem' }}>
        <button
          onClick={onPrev}
          disabled={!onPrev}
          className="btn-ghost"
          style={{
            padding: '0.4rem',
            opacity: !onPrev ? 0.3 : 1,
            cursor: !onPrev ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px'
          }}
          title="Save & Previous Chapter"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={onNext}
          disabled={!onNext}
          className="btn-ghost"
          style={{
            padding: '0.4rem',
            opacity: !onNext ? 0.3 : 1,
            cursor: !onNext ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px'
          }}
          title="Save & Next Chapter"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="chapter-header__main" style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
          {typeof title === 'string' && setTitle && (
              <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-label="Chapter Title"
                  style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '0.55rem 0.8rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                  }}
              />
          )}
      </div>

      <div className="chapter-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {(onSaveWav || onSaveMp3) && (
              <div style={{ position: 'relative' }}>
                  <button
                      onClick={() => setExportOpen(!exportOpen)}
                      className="btn-ghost"
                      style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                      title="Export Audio Options"
                  >
                      {exportingFormat ? <RefreshCw size={18} className="animate-spin" /> : <MoreVertical size={18} />}
                  </button>
                  {exportOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setExportOpen(false)} />
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 100, minWidth: '160px', padding: '0.5rem' }}>
                            {onSaveWav && (
                                <button onClick={() => { setExportOpen(false); onSaveWav(); }} disabled={exportingFormat !== null} className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem', fontSize: '0.85rem' }}>
                                    Export WAV
                                </button>
                            )}
                            {onSaveMp3 && (
                                <button onClick={() => { setExportOpen(false); onSaveMp3(); }} disabled={exportingFormat !== null} className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem', fontSize: '0.85rem' }}>
                                    Export MP3
                                </button>
                            )}
                        </div>
                      </>
                  )}
              </div>
          )}
      </div>
    </header>
  );
};
