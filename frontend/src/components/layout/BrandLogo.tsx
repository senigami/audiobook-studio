import React from 'react';

interface BrandLogoProps {
  /**
   * Optional scale factor to resize the entire wordmark.
   */
  scale?: number;
  className?: string;
  /**
   * Whether to show the pictorial logo icon next to the wordmark.
   */
  showIcon?: boolean;
  /**
   * Whether to use the stacked decorative layout (e.g. for banners).
   * Defaults to false (single line).
   */
  stacked?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  scale = 1, 
  className = '', 
  showIcon = false,
  stacked = false
}) => {
  const style = {
    '--as-title-fs': scale !== 1 
      ? `calc(${stacked ? 'clamp(32px, 4vw, 64px)' : '24px'} * ${scale})` 
      : (stacked ? undefined : '24px'),
    '--as-sub-fs': scale !== 1 ? `calc(clamp(14px, 1.2vw, 18px) * ${scale})` : undefined,
    display: 'flex',
    alignItems: 'center',
    gap: `${(stacked ? 16 : 12) * scale}px`
  } as React.CSSProperties;

  return (
    <div 
      className={`as-wordmark ${className}`} 
      aria-label="Audiobook Studio"
      style={style}
    >
      {showIcon && (
        <div style={{ 
          width: `${(stacked ? 44.398 : 34.2) * scale}px`,
          height: `${(stacked ? 40 : 32) * scale}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <img 
            src="/logo.png" 
            alt="" 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
          />
        </div>
      )}
      
      {stacked ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="as-title">Audiobook</div>
          <div className="as-subline">
            <span className="as-rule as-rule-left"></span>
            <span className="as-sub">STUDIO</span>
            <span className="as-rule as-rule-right"></span>
          </div>
        </div>
      ) : (
        <div style={{ 
          display: 'flex', 
          alignItems: 'baseline', 
          gap: '6px',
          fontWeight: 800,
          fontSize: 'var(--as-title-fs)',
          letterSpacing: '-0.02em',
          color: 'var(--as-ink)',
          whiteSpace: 'nowrap'
        }}>
          <span>Audiobook</span>
          <span style={{ color: 'var(--as-blue)', fontWeight: 700 }}>Studio</span>
        </div>
      )}
    </div>
  );
};
