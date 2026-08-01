interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const TRACK_CLASS: Record<'sm' | 'md' | 'lg', (checked: boolean) => string> = {
  sm: (c) =>
    `relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
      c ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
    }`,
  md: (c) =>
    `relative h-5 w-9 shrink-0 rounded-full transition-colors ${
      c ? 'bg-[var(--accent)]' : 'bg-[var(--border-card)]'
    }`,
  lg: (c) =>
    `relative h-6 w-11 shrink-0 rounded-full transition-colors ${
      c ? 'bg-[var(--accent)]' : 'bg-[var(--border-card)]'
    }`,
};

const KNOB_CLASS: Record<'sm' | 'md' | 'lg', (checked: boolean) => string> = {
  sm: (c) =>
    `absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
      c ? 'translate-x-3.5' : 'translate-x-0.5'
    }`,
  md: (c) =>
    `absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-150 ${
      c ? 'left-[18px]' : 'left-0.5'
    }`,
  lg: (c) =>
    `absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 ${
      c ? 'left-[22px]' : 'left-0.5'
    }`,
};

export default function ToggleSwitch({ checked, onChange, size = 'md', disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`${TRACK_CLASS[size](checked)} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span className={KNOB_CLASS[size](checked)} />
    </button>
  );
}
