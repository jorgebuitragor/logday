import { useState } from 'react';

interface InlineRenameInputProps {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
  autoFocus?: boolean;
}

export default function InlineRenameInput({
  value,
  onCommit,
  onCancel,
  className,
  autoFocus = true,
}: InlineRenameInputProps) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      autoFocus={autoFocus}
      value={draft}
      // Todo el nombre seleccionado al abrir, como en Finder: se escribe el
      // nuevo directamente.
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(draft)}
      className={className}
    />
  );
}
