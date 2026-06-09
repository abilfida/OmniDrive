import React from 'react';
import { describe, it, expect, vi, beforeEach, afterAll, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminUsersPage } from './AdminUsersPage';
import { useAuthStore } from '../stores/authStore';

// Mock the auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

// Mock the lucide-react icons
vi.mock('lucide-react', () => ({
  ShieldAlert: () => <div data-testid="shield-alert-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  MoreVertical: () => <div data-testid="more-vertical-icon" />,
  X: () => <div data-testid="x-icon" />,
}));

// Mock the invite modal to simplify testing
vi.mock('../components/admin/InviteUserModal', () => ({
  InviteUserModal: ({ onClose, onSubmit }: any) => (
    <div data-testid="invite-user-modal">
      <button onClick={onClose}>Close Modal</button>
      <button onClick={() => onSubmit('test@example.com', 'admin')}>Submit Modal</button>
    </div>
  ),
}));

// Mock window.confirm
const originalConfirm = window.confirm;

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  afterAll(() => {
    window.confirm = originalConfirm;
  });

  it('renders access denied for non-admin users', () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'user1', role: 'user' },
    });

    render(<AdminUsersPage />);

    expect(screen.getByText('Access Denied')).toBeTruthy();
    expect(screen.getByText('You do not have permission to view this page.')).toBeTruthy();
  });

  it('renders the user management table for admin users', () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'admin' },
    });

    render(<AdminUsersPage />);

    expect(screen.getByText('User Management')).toBeTruthy();
    expect(screen.getByRole('button', { name: /invite user/i })).toBeTruthy();
    expect(screen.getByText('Admin One')).toBeTruthy();
    expect(screen.getByText('User Two')).toBeTruthy();
  });

  it('opens and closes the invite modal', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'admin' },
    });

    render(<AdminUsersPage />);

    // Open modal
    const inviteBtn = screen.getByRole('button', { name: /invite user/i });
    fireEvent.click(inviteBtn);

    expect(screen.getByTestId('invite-user-modal')).toBeTruthy();

    // Close modal
    fireEvent.click(screen.getByText('Close Modal'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('invite-user-modal')).not.toBeTruthy();
    });
  });

  it('submits the invite modal and closes it', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'admin' },
    });

    render(<AdminUsersPage />);

    // Open modal
    const inviteBtn = screen.getByRole('button', { name: /invite user/i });
    fireEvent.click(inviteBtn);

    // Submit modal
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation();
    fireEvent.click(screen.getByText('Submit Modal'));
    
    expect(consoleSpy).toHaveBeenCalledWith('Inviting', 'test@example.com', 'admin');
    
    await waitFor(() => {
      expect(screen.queryByTestId('invite-user-modal')).not.toBeTruthy();
    });
    
    consoleSpy.mockRestore();
  });
});
