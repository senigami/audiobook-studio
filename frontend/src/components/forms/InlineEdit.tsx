import React, { useState, useRef, useEffect } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  inputAriaLabel?: string;
  inputSize?: number;
  multiline?: boolean;
  disabled?: boolean;
}

/**
 * A unified inline editing component that follows the project's canonical pattern:
 * - Single-click to enter edit mode
 * - Exit and SAVE on blur (if changed)
 * - Exit and SAVE on Enter (if not multiline)
 * - Exit and CANCEL on Escape
 * - No pencil icon required for discovery
 */
export const InlineEdit: React.FC<InlineEditProps> = ({
  value,
  onSave,
  placeholder,
  className,
  style,
  inputStyle,
  inputAriaLabel,
  inputSize,
  multiline = false,
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [isHovering, setIsHovering] = useState(false);
  const skipBlurSave = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTempValue(value);
      // Auto-select text on enter
      if (inputRef.current) {
        inputRef.current.select();
      }
    }
  }, [isEditing, value]);

  const handleSave = () => {
    if (tempValue !== value) {
      onSave(tempValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTempValue(value);
  };

  if (isEditing && !disabled) {
    const commonProps = {
      ref: inputRef as any,
      autoFocus: true,
      value: tempValue,
      onChange: (e: React.ChangeEvent<any>) => setTempValue(e.target.value),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          skipBlurSave.current = true;
          handleSave();
        } else if (e.key === 'Escape') {
          skipBlurSave.current = true;
          handleCancel();
        }
      },
      onBlur: () => {
        if (skipBlurSave.current) {
          skipBlurSave.current = false;
          return;
        }
        handleSave();
      },
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      placeholder,
      'aria-label': inputAriaLabel,
      className: `inline-edit-input ${className || ''}`,
      size: inputSize,
      style: {
        background: 'var(--surface)',
        border: '1px solid rgba(var(--accent-rgb), 0.35)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        padding: '0.45rem 0.6rem',
        width: '100%',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        fontFamily: 'inherit',
        outline: 'none',
        ...inputStyle
      }
    };

    return multiline ? (
      <textarea {...commonProps} rows={Math.max(1, tempValue.split('\n').length)} />
    ) : (
      <input type="text" {...commonProps} />
    );
  }

  return (
    <div
      className={`inline-edit-trigger ${className || ''}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        setIsEditing(true);
      }}
      style={{ 
        cursor: disabled ? 'default' : 'text', 
        minHeight: '1em',
        display: 'flex',
        alignItems: 'center',
        borderRadius: '8px',
        padding: '0.3rem 0.45rem',
        transition: 'background-color 120ms ease, box-shadow 120ms ease, color 120ms ease',
        background: isHovering && !disabled ? 'rgba(var(--text-primary-rgb), 0.03)' : 'transparent',
        ...style 
      }}
      title={disabled ? undefined : (placeholder || 'Click to edit')}
    >
      {value || (placeholder && <span style={{ opacity: 'inherit' }}>{placeholder}</span>)}
    </div>
  );
};
