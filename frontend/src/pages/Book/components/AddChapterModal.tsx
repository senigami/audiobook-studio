import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { emitToast } from '@/utils/toast';
import { getChapterImportError, isSupportedChapterImportFile } from '@/pages/Book/lib/chapterImport';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface AddChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, text: string, file: File | null) => void;
  submitting: boolean;
}

export const AddChapterModal: React.FC<AddChapterModalProps> = ({ isOpen, onClose, onSubmit, submitting }) => {
  const [title, setTitle] = React.useState('');
  const [text, setText] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

  const handleFileChange = (nextFile: File | null) => {
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!isSupportedChapterImportFile(nextFile)) {
      emitToast(getChapterImportError(nextFile));
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFile(null);
      return;
    }
    setFile(nextFile);
  };

  if (!isOpen) return null;

  const trimmedTitle = title.trim();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-backdrop)', backdropFilter: 'blur(4px)' }}>
        <motion.div ref={dialogRef} role="dialog" aria-modal="true" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Add New Chapter</h3>
            <form onSubmit={(e) => { e.preventDefault(); if (!trimmedTitle) return; onSubmit(trimmedTitle, text, file); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Chapter Title *</label>
                    <input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 1" style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none' }} />
                </div>
                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Upload Manuscript (Optional)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input type="file" ref={fileInputRef} onChange={e => handleFileChange(e.target.files?.[0] || null)} accept=".txt" style={{ display: 'none' }} />
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-ghost" style={{ border: '1px dashed var(--border)', padding: '0.75rem 1.5rem' }}>{file ? file.name : 'Choose .txt File...'}</button>
                        {file && <button type="button" onClick={() => setFile(null)} className="btn-danger" style={{ padding: '0.5rem' }}><Trash2 size={16} /></button>}
                    </div>
                </div>
                {!file && (
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Or Paste Text</label>
                        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste your chapter text here..." rows={6} style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'monospace' }} />
                    </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
                    <button type="submit" disabled={submitting || !trimmedTitle} className="btn-primary" style={{ minWidth: '100px' }}>{submitting ? 'Saving...' : 'Add Chapter'}</button>
                </div>
            </form>
        </motion.div>
    </div>
  );
};
