import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface GhostButtonProps {
    onClick: (e: React.MouseEvent) => void;
    icon: LucideIcon;
    label?: string;
    className?: string;
    style?: React.CSSProperties;
    iconSize?: number;
    title?: string;
    isActive?: boolean;
    disabled?: boolean;
}

export const GhostButton: React.FC<GhostButtonProps> = ({
    onClick,
    icon: Icon,
    label,
    className = "",
    style = {},
    iconSize = 18,
    title,
    isActive = false,
    disabled = false
}) => {
    const [isHovered, setIsHovered] = useState(false);

    const baseStyle: React.CSSProperties = {
        gap: label ? '8px' : '0',
        padding: label ? '0 20px' : '0',
        height: '40px',
        width: label ? 'auto' : '40px',
        minWidth: '40px',
        borderRadius: 'var(--radius-button)',
        border: (isActive || isHovered) ? '1px solid var(--accent)' : '1px solid var(--border)',
        color: (isActive || isHovered) ? 'var(--accent)' : 'var(--text-secondary)',
        background: (isActive || isHovered) ? 'var(--accent-glow)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        fontWeight: 700,
        fontSize: '0.9rem',
        boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
        ...style
    };

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`btn-ghost btn-responsive ${className}`}
            style={baseStyle}
            title={title}
            disabled={disabled}
        >
            <Icon size={iconSize} strokeWidth={isActive ? 2.5 : 2} style={{ flexShrink: 0 }} />
            {label && <span className="nav-label">{label}</span>}
        </button>
    );
};
