import React from 'react';
import { RefreshCw } from 'lucide-react';

interface EditorTabsProps {
  editorTab: 'script' | 'edit' | 'preview' | 'production' | 'performance';
  setEditorTab: (tab: 'script' | 'edit' | 'preview' | 'production' | 'performance') => void;
  onSave: () => Promise<boolean>;
  onEnsureVoiceChunks: () => Promise<void>;
  analysis?: any;
  loadingVoiceChunks: boolean;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  editorTab,
  setEditorTab,
  onSave,
  onEnsureVoiceChunks,
  analysis,
  loadingVoiceChunks
}) => {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', flexShrink: 0 }}>
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
      <button 
          onClick={async () => {
              await onSave();
              setEditorTab('performance');
          }} 
          className={editorTab === 'performance' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
      >
          Performance
      </button>
      <button 
          onClick={async () => {
              if (!analysis?.voice_chunks && !analysis?.safe_text) {
                  alert("Please wait for text to be analyzed...");
                  return;
              }
              await onEnsureVoiceChunks();
              setEditorTab('preview');
          }} 
          className={editorTab === 'preview' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
          disabled={(!analysis?.safe_text && !analysis?.voice_chunks && !analysis?.char_count) || loadingVoiceChunks}
      >
          {loadingVoiceChunks ? <RefreshCw size={14} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} /> : null}
          Preview Safe Output
      </button>
    </div>
  );
};
