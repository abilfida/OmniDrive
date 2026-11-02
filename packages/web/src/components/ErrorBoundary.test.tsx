import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('render failed');
  return <p>content ok</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs caught errors
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a fallback instead of unmounting the app when a child throws', () => {
    render(<ErrorBoundary><Boom explode /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
  });

  it('recovers when the reset key changes (e.g. navigating to another page)', () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom explode /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(<ErrorBoundary resetKey="/b"><Boom explode={false} /></ErrorBoundary>);
    expect(screen.getByText('content ok')).toBeTruthy();
  });

  it('can retry rendering in place', () => {
    let explode = true;
    const Flaky = () => <Boom explode={explode} />;
    render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    explode = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('content ok')).toBeTruthy();
  });
});
