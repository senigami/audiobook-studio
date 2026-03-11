import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Image as ImageIcon } from 'lucide-react';
import type { Project } from '../../types';

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

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Add New Chapter</h3>
            <form onSubmit={(e) => { e.preventDefault(); onSubmit(title, text, file); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Chapter Title *</label>
                    <input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 1" style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none' }} />
                </div>
                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Upload Manuscript (Optional)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input type="file" ref={fileInputRef} onChange={e => setFile(e.target.files?.[0] || null)} accept=".txt" style={{ display: 'none' }} />
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
                    <button type="submit" disabled={submitting || !title} className="btn-primary" style={{ minWidth: '100px' }}>{submitting ? 'Saving...' : 'Add Chapter'}</button>
                </div>
            </form>
        </motion.div>
    </div>
  );
};

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSubmit: (data: { name: string; series: string; author: string; cover?: File | null }) => void;
  submitting: boolean;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({ isOpen, onClose, project, onSubmit, submitting }) => {
  const [data, setData] = React.useState({ name: project.name, series: project.series || '', author: project.author || '' });
  const [cover, setCover] = React.useState<File | null>(null);
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const editCoverInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    setCover(file);
    const reader = new FileReader();
    reader.onloadend = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Edit Project Details</h3>
            <form onSubmit={(e) => { e.preventDefault(); onSubmit({...data, cover}); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Project Name *</label>
                    <input autoFocus required value={data.name} onChange={e => setData({...data, name: e.target.value})} style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Series (Optional)</label>
                        <input value={data.series} onChange={e => setData({...data, series: e.target.value})} style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Author (Optional)</label>
                        <input value={data.author} onChange={e => setData({...data, author: e.target.value})} style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none' }} />
                    </div>
                </div>
                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Update Cover Art (Optional)</label>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div onClick={() => editCoverInputRef.current?.click()} onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }} style={{ width: '100px', height: '100px', flexShrink: 0, borderRadius: '8px', border: isDragging ? '2px solid var(--accent)' : '2px dashed var(--border)', background: isDragging ? 'var(--accent-glow)' : 'var(--surface-light)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', transition: 'all 0.2s ease' }}>
                            {coverPreview ? <img src={coverPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" /> : <div style={{ textAlign: 'center' }}><ImageIcon size={20} style={{ opacity: 0.5 }} /><p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{isDragging ? 'Drop' : 'New Cover'}</p></div>}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <input type="file" ref={editCoverInputRef} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} accept="image/*" style={{ display: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button type="button" onClick={() => editCoverInputRef.current?.click()} className="btn-ghost" style={{ border: '1px solid var(--border)', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Choose File...</button>
                                {cover && <button type="button" onClick={() => { setCover(null); setCoverPreview(null); }} className="btn-danger" style={{ padding: '0.5rem' }}><Trash2 size={16} /></button>}
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
                    <button type="submit" disabled={submitting || !data.name} className="btn-primary" style={{ minWidth: '100px' }}>{submitting ? 'Saving...' : 'Save Changes'}</button>
                </div>
            </form>
        </motion.div>
    </div>
  );
};

export const CoverImageModal: React.FC<{ isOpen: boolean; onClose: () => void; imagePath: string }> = ({ isOpen, onClose, imagePath }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
        <img src={imagePath} alt="Cover" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()} />
    </div>
  );
};
