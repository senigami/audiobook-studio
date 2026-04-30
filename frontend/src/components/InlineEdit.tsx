import React, { useState, useRef, useEffect } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
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
  multiline = false,
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
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
      style: {
        background: 'var(--surface-light)',
        border: '1px solid var(--accent)',
        borderRadius: '4px',
        color: 'var(--text-primary)',
        padding: '2px 4px',
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
        ...style 
      }}
      title={disabled ? undefined : (placeholder || 'Click to edit')}
    >
      {value || (placeholder && <span style={{ opacity: 0.5 }}>{placeholder}</span>)}
    </div>
  );
};
