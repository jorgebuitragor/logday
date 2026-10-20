import { useState } from 'react';

export function useConfirmDelete<T>(confirmDestructiveActions: boolean) {
  const [pending, setPending] = useState<T | null>(null);

  const request = (item: T, directAction: (item: T) => void) => {
    if (confirmDestructiveActions) setPending(item);
    else directAction(item);
  };

  const cancel = () => setPending(null);

  return { pending, isOpen: pending !== null, request, cancel };
}
