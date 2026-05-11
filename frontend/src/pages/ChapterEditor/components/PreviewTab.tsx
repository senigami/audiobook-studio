import React from 'react';
import { RefreshCw } from 'lucide-react';

interface PreviewTabProps {
  analysis: any;
  analyzing: boolean;
}

export const PreviewTab: React.FC<PreviewTabProps> = ({
  analysis,
  analyzing
}) => {
  return (
    <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', overflowY: 'auto' }}>
        <div style={{ width: '100%', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, opacity: 0.8, fontSize: '1.2rem', fontWeight: 600 }}>Preview Safe Output</h3>
                {analysis && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                        <span>{analysis.sent_count} Sentences</span> /
                        <span>{analysis.char_count} Characters (of {analysis.threshold || 250})</span>
                    </div>
                )}
            </div>
            
            {analyzing ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '1rem' }} />
                    <p>Analyzing text and splitting into engine-safe segments...</p>
                </div>
            ) : (analysis?.voice_chunks) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {analysis.voice_chunks.map((chunk: any, cidx: number) => {
                        const isTooLong = (chunk.raw_length || chunk.length) > (analysis.threshold || 250);
                        return (
                            <div key={cidx} style={{ 
                                padding: '1rem', 
                                background: 'var(--surface)', 
                                borderRadius: '12px', 
                                border: `1px solid ${isTooLong ? 'var(--error-muted)' : 'var(--border)'}`,
                                borderLeft: `6px solid ${chunk.character_color || 'var(--primary)'}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                position: 'relative'
                            }}>
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    <div style={{ 
                                        color: chunk.character_color || 'var(--text-muted)', 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem'
                                    }}>
                                        <span style={{ color: '#ccc' }}>#{cidx + 1}</span>
                                        <span>{chunk.character_name}</span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', opacity: 0.6, display: 'flex', gap: '0.8rem' }}>
                                        {chunk.sent_count > 0 && <span>{chunk.sent_count}</span>} /
                                        <span style={{ color: isTooLong ? 'var(--error)' : 'inherit' }}>
                                            {chunk.raw_length || chunk.length}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ 
                                    fontSize: '1.05rem', 
                                    color: 'var(--text-primary)', 
                                    lineHeight: 1.7, 
                                    fontFamily: 'serif',
                                    whiteSpace: 'pre-wrap',
                                    background: 'rgba(255,255,255,0.01)',
                                    padding: '0.5rem',
                                    borderRadius: '4px'
                                }}>
                                    {chunk.text}<span style={{ color: 'var(--primary)', opacity: 0.8, fontWeight: 900, marginLeft: '2px' }}></span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : analysis?.safe_text ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {analysis.safe_text.split('\n').map((block: string, bidx: number) => {
                        const isTooLong = block.length > (analysis.threshold || 250) + 20; 
                        return (
                            <div key={bidx} style={{ 
                                padding: '1.25rem', 
                                background: 'var(--surface)', 
                                borderRadius: '12px', 
                                border: `1px solid ${isTooLong ? 'var(--error-muted)' : 'var(--border)'}`,
                                display: 'flex',
                                gap: '1.5rem',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ width: '40px', flexShrink: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, opacity: 0.6 }}>
                                    #{bidx + 1}
                                </div>
                                <div style={{ flex: 1, fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.7, fontFamily: 'serif', whiteSpace: 'pre-wrap' }}>
                                    {block}<span style={{ color: 'var(--primary)', opacity: 0.8, fontWeight: 900 }}>|</span>
                                </div>
                                <div style={{ width: '60px', flexShrink: 0, textAlign: 'right', fontSize: '0.75rem', color: isTooLong ? 'var(--error)' : 'var(--text-muted)', fontWeight: 600 }}>
                                    {block.length}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                    No analysis available. Please enter some text in the Edit tab.
                </div>
            )}
        </div>
    </div>
  );
};
