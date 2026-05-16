import React from 'react';

interface EditorTabsProps {
  editorTab: 'script' | 'edit' | 'production';
  setEditorTab: (tab: 'script' | 'edit' | 'production') => void;
  onSave: () => Promise<boolean>;
  onRequestEditSourceText?: () => void;
  sourceTextMode?: 'view' | 'edit';
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  editorTab,
  setEditorTab,
  onSave,
  onRequestEditSourceText,
  sourceTextMode = 'view'
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', flexShrink: 0 }}>
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
        <button 
          onClick={async () => {
              await onSave();
              setEditorTab('production');
          }} 
          className={editorTab === 'production' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
        >
            Production
        </button>
      </div>
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
  );
};
