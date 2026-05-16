import React from 'react';

interface EditorTabsProps {
  editorTab: 'script' | 'edit';
  setEditorTab: (tab: 'script' | 'edit') => void;
  onRequestEditSourceText?: () => void;
  sourceTextMode?: 'view' | 'edit';
  children?: React.ReactNode;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  editorTab,
  setEditorTab,
  onRequestEditSourceText,
  sourceTextMode = 'view',
  children
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setEditorTab('script')} 
          className={editorTab === 'script' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
        >
            Script
        </button>
        <button 
          onClick={() => setEditorTab('edit')} 
          className={editorTab === 'edit' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
        >
            Source Text
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {children}
        {editorTab === 'edit' && sourceTextMode === 'view' && onRequestEditSourceText && (
          <button
            type="button"
            className="btn-glass"
            style={{ padding: '8px 14px', fontSize: '0.85rem', borderRadius: '8px', fontWeight: 800, whiteSpace: 'nowrap' }}
            onClick={onRequestEditSourceText}
          >
            Edit Source Text
          </button>
        )}
      </div>
    </div>
  );
};
