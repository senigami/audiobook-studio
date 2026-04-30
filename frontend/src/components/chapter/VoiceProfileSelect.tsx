import React from 'react';
import type { VoiceOption } from '../../utils/voiceProfiles';

interface VoiceProfileSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: VoiceOption[];
  defaultLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
}

/**
 * Reusable dropdown component for voice profile selection.
 * Handles grouped options (Assigned Characters vs. Other Voices)
 * and maintains consistent labeling and disabled-state behavior.
 */
export const VoiceProfileSelect: React.FC<VoiceProfileSelectProps> = ({
  value,
  onChange,
  options,
  defaultLabel = 'Use Project Default',
  className,
  style,
  title,
  disabled = false
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={className}
      style={{
        padding: '0.4rem 2rem 0.4rem 0.8rem',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        background: 'var(--surface-light)',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        outline: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.5rem center',
        ...style
      }}
      title={title}
      disabled={disabled}
    >
      <option value="">{defaultLabel}</option>
      {value && !options.some(opt => opt.value === value) && (
        <option value={value} disabled>
          {value}
        </option>
      )}
      {options.map((opt) => (
        <option
          key={opt.id}
          value={opt.value}
          disabled={opt.disabled}
          title={opt.disabled_reason}
        >
          {opt.name}
        </option>
      ))}
    </select>
  );
};
