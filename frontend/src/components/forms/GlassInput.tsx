import React, { useState } from 'react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    icon?: React.ReactNode;
    fullWidth?: boolean;
}

/**
 * A reusable, premium-styled input component with glassmorphism aesthetics.
 * Features a pill-shape, theme-aware focus effects, and optional icon support.
 */
export const GlassInput: React.FC<GlassInputProps> = ({ 
    icon, 
    style, 
    onFocus, 
    onBlur, 
    fullWidth = true,
    className = '',
    ...props 
}) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
        <div style={{ position: 'relative', width: fullWidth ? '100%' : 'auto' }}>
            {icon && (
                <div style={{ 
                    position: 'absolute', 
                    left: '14px', 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isFocused ? 1 : 0.7,
                    transition: 'opacity 0.2s ease'
                }}>
                    {icon}
                </div>
            )}
            <input
                {...props}
                className={`form-input ${className}`}
                onFocus={(e) => {
                    setIsFocused(true);
                    onFocus?.(e);
                }}
                onBlur={(e) => {
                    setIsFocused(false);
                    onBlur?.(e);
                }}
                style={{
                    padding: icon ? '10px 14px 10px 40px' : '10px 16px',
                    borderRadius: '100px',
                    background: 'var(--surface)',
                    border: '1px solid',
                    borderColor: isFocused ? 'var(--accent)' : 'var(--border)',
                    boxShadow: isFocused ? '0 0 0 4px rgba(var(--accent-rgb), 0.08)' : 'none',
                    fontSize: '0.9rem',
                    width: '100%',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    ...style
                }}
            />
        </div>
    );
};
