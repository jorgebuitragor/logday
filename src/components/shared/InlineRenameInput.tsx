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
