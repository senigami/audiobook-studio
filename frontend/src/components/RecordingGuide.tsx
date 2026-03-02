import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Prompt {
    id: string;
    text: string;
    isRecommended?: boolean;
}

interface PromptCategory {
    name: string;
    prompts: Prompt[];
}

const PROMPT_LIBRARY: PromptCategory[] = [
    {
        name: 'Neutral / Calm',
        prompts: [
            { id: 'n1', text: 'Audio check. I’m speaking clearly, not too fast, not too slow. Please pack the blue jacket, zip the small zipper, and set the box on the shelf.', isRecommended: true },
            { id: 'n2', text: 'I counted five quick steps, then heard a soft click by the door. The bright light faded, the room grew quiet, and the clock ticked on.' },
            { id: 'n3', text: 'Some words are sharp, others are smooth; I’ll keep them clean and steady. If you can hear every consonant and every vowel, we’re ready.' }
        ]
    },
    {
        name: 'Happy / Upbeat',
        prompts: [
            { id: 'h1', text: 'Okay, yes! This is going to be fun. We fixed the tiny glitch, and now it sounds fantastic.' },
            { id: 'h2', text: 'Grab the fresh lemons, the peach jam, and the warm bread, and bring it here. I can’t believe how quickly that worked, it’s brilliant.' },
            { id: 'h3', text: 'Listen to that crisp little ‘ch’ and ‘sh’ sound. Perfect. All right, let’s go again, bright voice, steady rhythm.' }
        ]
    },
    {
        name: 'Sad / Tender',
        prompts: [
            { id: 's1', text: 'I didn’t mean for it to turn out like this. The room feels empty, and even small sounds seem far away.' },
            { id: 's2', text: 'I found the note, folded twice, and set it back where it belongs. Please don’t rush. Just breathe, and let the words land quietly.' }
        ]
    },
    {
        name: 'Scared / Tense',
        prompts: [
            { id: 'sc1', text: 'Did you hear that? Stop, listen. I thought I saw something move near the window. Keep your voice low.' },
            { id: 'sc2', text: 'If the floor creaks, freeze. If the door clicks, hide. I’m trying not to panic, but my heart is racing.' }
        ]
    },
    {
        name: 'Commanding / Angry',
        prompts: [
            { id: 'a1', text: 'No. That’s not acceptable. You missed the mark, and now we fix it properly. Check the chart, jot the result.' },
            { id: 'a2', text: 'I want clear words, sharp edges, and zero excuses. Good. Now do it again, exactly the same.' }
        ]
    }
];

export const RecordingGuide: React.FC = () => {
    const [expandedCategory, setExpandedCategory] = useState<string | null>('Neutral / Calm');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Quick Tips */}
            <div style={{ 
                background: 'var(--surface-alt)', 
                padding: '1.5rem', 
                borderRadius: '16px', 
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
                    <HelpCircle size={16} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Best Results Guide</span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <h5 style={{ fontSize: '0.8rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Audio Quality</h5>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Record in a silent, upholstered room (no echo)</li>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Use a dedicated microphone if possible</li>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Avoid background hum (AC, fans, computers)</li>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>6–15 seconds per clip is the sweet spot</li>
                        </ul>
                    </div>
                    <div>
                        <h5 style={{ fontSize: '0.8rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Performance</h5>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Speak naturally, like talking to a friend</li>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Maintain consistent distance (about 6 inches)</li>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Enunciate clearly but without over-acting</li>
                            <li style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Record 10–15 total samples for best quality</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Prompt Library */}
            <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label>Prompt Library</label>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {PROMPT_LIBRARY.map((cat) => (
                        <div key={cat.name} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                            <button
                                onClick={() => setExpandedCategory(expandedCategory === cat.name ? null : cat.name)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'var(--surface)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.85rem',
                                    fontWeight: 600
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {expandedCategory === cat.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '0.85rem' }}>{cat.name}</span>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>{cat.prompts.length} scripts</span>
                                    </div>
                                </div>
                                {cat.prompts.some(p => p.isRecommended) && (
                                    <span style={{ 
                                        fontSize: '0.65rem', 
                                        padding: '2px 6px', 
                                        background: 'var(--accent-glow)', 
                                        color: 'var(--accent)',
                                        borderRadius: '4px',
                                        fontWeight: 700
                                    }}>RECOMMENDED</span>
                                )}
                            </button>
                            
                            <AnimatePresence>
                                {expandedCategory === cat.name && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                    >
                                        <div style={{ padding: '12px', background: 'var(--surface-light)', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border)' }}>
                                            {cat.prompts.map((p) => (
                                                <div key={p.id} style={{ 
                                                    background: 'var(--surface)', 
                                                    padding: '10px', 
                                                    borderRadius: '6px', 
                                                    border: '1px solid var(--border)',
                                                    display: 'flex',
                                                    gap: '12px'
                                                }}>
                                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', flex: 1, margin: 0, lineHeight: '1.5' }}>
                                                        {p.text}
                                                    </p>
                                                    <button
                                                        onClick={() => copyToClipboard(p.text, p.id)}
                                                        className="btn-ghost"
                                                        style={{ padding: '6px', borderRadius: '4px', height: 'fit-content' }}
                                                        title="Copy text"
                                                    >
                                                        {copiedId === p.id ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Use 3–5 different prompts to capture range and avoid repetition.
                </p>
            </div>
        </div>
    );
};
