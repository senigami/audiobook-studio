import React from 'react';

/**
 * EngineBadge.tsx — shared engine-badge treatment (DC-007, voice-variant-tagging-and-ia
 * task 012). Consolidates three near-duplicate hand-rolled badges (VariantEditor's,
 * VoiceCatalogCard's, and the "disabled/unselectable" muted variant) into one component
 * that only ever composes token-based colors — no inline hex-alpha string concatenation.
 *
 * Note: VariantEditor's previous badge built its border via
 * `` `1px solid ${engineBadge.color}33` `` where `engineBadge.color` was itself a CSS
 * variable reference (e.g. `'var(--action-primary)'`) — appending `33` onto that produces an
 * invalid CSS color (`var(--action-primary)33`), which browsers silently drop, so that badge was
 * effectively borderless in practice. Using the real `--accent-tint-border` /
 * `--cloud-tint-border` tokens here means a genuine (intended) border now renders where
 * VariantEditor's badge previously had none — a visual fix, not a regression.
 */

export type EngineBadgeTone = 'cloud' | 'accent' | 'muted';
export type EngineBadgeSize = 'md' | 'sm';

export interface EngineBadgeProps {
    label: string;
    tone: EngineBadgeTone;
    /** 'md' matches VariantEditor's pill sizing (via CSS class); 'sm' matches
     *  VoiceCatalogCard's compact tag sizing. Defaults to 'md'. */
    size?: EngineBadgeSize;
    /** Whether to render a token-based border. VoiceCatalogCard's original 'sm' badge
     *  had no border at all — default true for 'md', false for 'sm' preserves that. */
    bordered?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

const TONE_TOKENS: Record<EngineBadgeTone, { bg: string; color: string; border: string }> = {
    cloud: { bg: 'var(--cloud-tint-bg)', color: 'var(--cloud-color)', border: 'var(--cloud-tint-border)' },
    accent: { bg: 'var(--accent-tint-bg)', color: 'var(--action-primary)', border: 'var(--accent-tint-border)' },
    muted: { bg: 'var(--accent-focus-ring)', color: 'var(--text-muted)', border: 'var(--border)' },
};

const SM_SIZE_STYLE: React.CSSProperties = {
    fontSize: '0.6rem',
    padding: '1px 6px',
    borderRadius: 'var(--radius-round)',
    fontWeight: 700,
    letterSpacing: '0.02em',
    display: 'inline-block',
};

export const EngineBadge: React.FC<EngineBadgeProps> = ({
    label,
    tone,
    size = 'md',
    bordered = size === 'md',
    className = '',
    style,
}) => {
    const tokens = TONE_TOKENS[tone];
    const isMd = size === 'md';

    return (
        <span
            className={isMd ? `variant-editor__engine-badge ${className}`.trim() : className || undefined}
            style={{
                background: tokens.bg,
                color: tokens.color,
                border: bordered ? `1px solid ${tokens.border}` : 'none',
                ...(isMd ? {} : SM_SIZE_STYLE),
                ...style,
            }}
        >
            {label}
        </span>
    );
};
