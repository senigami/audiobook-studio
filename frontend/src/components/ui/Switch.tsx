import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  id,
  disabled = false,
  className = '',
}) => {
  const stateClass = checked ? 'switch--on' : 'switch--off';

  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      disabled={disabled}
      onClick={handleClick}
      className={`switch ${stateClass}${className ? ` ${className}` : ''}`}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__knob"></span>
      </span>
      {label && <span className="switch__label">{label}</span>}
    </button>
  );
};
