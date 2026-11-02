import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useEscapeToClose } from './useEscapeToClose';
import { ToastContainer } from '../components/Toast';

function Modal({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose);
  return <div role="dialog">dialog</div>;
}

describe('useEscapeToClose', () => {
  it('closes on Escape and ignores other keys', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops listening once the modal unmounts', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Modal onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ToastContainer', () => {
  it('keeps its live region mounted even with no toasts, so the first toast is announced', () => {
    const { container } = render(<ToastContainer />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
