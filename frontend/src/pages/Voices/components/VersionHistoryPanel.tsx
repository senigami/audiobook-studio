import React, { useState } from 'react';
import { ChevronUp, History } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVariantVersions, type VoiceVersion } from '@/hooks/useVariantVersions';
import { formatRelativeTime } from '@/utils/format';
import { VersionAbPanel } from '@/pages/Voices/components/VersionAbPanel';

interface VersionHistoryPanelProps {
    voiceName: string;
    onPromoted: () => void;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean }) => void;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
    voiceName, onPromoted, requestConfirm
}) => {
    const { versions, promote } = useVariantVersions(voiceName);
    const [isExpanded, setIsExpanded] = useState(false);
    const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

    const toggleCompare = (versionId: string) => {
        setCompareIds((prev) => {
            const next = new Set(prev);
            if (next.has(versionId)) {
                next.delete(versionId);
                return next;
            }
            if (next.size >= 2) {
                // Evict the oldest-selected id (Set preserves insertion order).
                const oldest = next.values().next().value;
                if (oldest !== undefined) next.delete(oldest);
            }
            next.add(versionId);
            return next;
        });
    };

    if (versions.length === 0) {
        return (
            <div className="variant-editor__version-history variant-editor__version-history--empty">
                <span className="variant-editor__version-history-muted">
                    History starts with the next rebuild
                </span>
            </div>
        );
    }

    const handlePromote = (version: VoiceVersion) => {
        requestConfirm({
            title: 'Promote this version?',
            message: 'Make this version active? The current state will be saved as a new version first, so nothing is lost.',
            isDestructive: false,
            onConfirm: async () => {
                const ok = await promote(version.id);
                if (ok) onPromoted();
            },
        });
    };

    return (
        <div className="variant-editor__version-history">
            <div className="variant-editor__version-history-header">
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="btn-ghost hover-bg-subtle variant-editor__version-history-toggle-btn"
                >
                    <History size={14} className="text-accent" />
                    <span className="variant-editor__version-history-title">
                        Version history ({versions.length})
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="btn-ghost hover-bg-subtle variant-editor__version-history-collapse-btn"
                    aria-label={isExpanded ? 'Collapse version history' : 'Expand version history'}
                >
                    <ChevronUp
                        size={16}
                        style={{
                            transform: isExpanded ? 'none' : 'rotate(180deg)',
                            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            color: 'var(--text-muted)'
                        }}
                    />
                </button>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="variant-editor__version-history-body">
                            {versions.map((version) => (
                                <div key={version.id} className="variant-editor__version-history-row">
                                    <input
                                        type="checkbox"
                                        aria-label={`Compare version ${version.id}`}
                                        checked={compareIds.has(version.id)}
                                        onChange={() => toggleCompare(version.id)}
                                        className="variant-editor__version-history-compare-checkbox"
                                    />
                                    <span className="variant-editor__version-history-timestamp">
                                        {formatRelativeTime(version.created_at)}
                                    </span>
                                    <span
                                        className="variant-editor__engine-badge"
                                        style={{
                                            background: 'var(--accent-tint-bg)',
                                            color: 'var(--action-primary)',
                                            border: '1px solid var(--action-primary)33'
                                        }}
                                    >
                                        {version.model || version.engine_id}
                                    </span>
                                    <span className="variant-editor__version-history-samples">
                                        {version.sample_count} sample{version.sample_count === 1 ? '' : 's'}
                                    </span>
                                    {version.is_active ? (
                                        <span className="variant-editor__version-history-active-label">
                                            Active
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handlePromote(version)}
                                            className="btn-ghost hover-bg-subtle variant-editor__version-history-promote-btn"
                                        >
                                            Promote
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {compareIds.size === 2 && (() => {
                            const [idA, idB] = Array.from(compareIds);
                            const versionA = versions.find((v) => v.id === idA);
                            const versionB = versions.find((v) => v.id === idB);
                            if (!versionA || !versionB) return null;
                            return (
                                <VersionAbPanel
                                    voiceName={voiceName}
                                    versionA={versionA}
                                    versionB={versionB}
                                />
                            );
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
