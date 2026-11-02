import { useEffect } from 'react';

// Closes a custom modal on Escape, which keyboard users expect from any dialog.
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
}
