import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { useAuthStore } from '../stores/authStore';

function LoginProbe() {
  const location = useLocation();
  return <p>login page {location.search}</p>;
}

describe('AuthGuard', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, fetchUser: vi.fn(async () => {}) });
  });

  it('redirects to login and remembers the page the user wanted', () => {
    render(
      <MemoryRouter initialEntries={['/files/abc?driveId=d1']}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/files/:id" element={<AuthGuard><p>secret</p></AuthGuard>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(`login page ?next=${encodeURIComponent('/files/abc?driveId=d1')}`)).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('renders the page for signed-in users', () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(
      <MemoryRouter initialEntries={['/files']}>
        <Routes>
          <Route path="/files" element={<AuthGuard><p>secret</p></AuthGuard>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('secret')).toBeTruthy();
  });
});
