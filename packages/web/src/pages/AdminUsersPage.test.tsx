import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
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

vi.mock('../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button data-testid="dropdown-item" onClick={onClick}>{children}</button>
  ),
}));

vi.mock('../components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders access denied for non-admin users', () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'user1', role: 'member' },
    });

    render(<AdminUsersPage />);

    expect(screen.getByText('Access Denied')).toBeTruthy();
    expect(screen.getByText('You do not have permission to view this page.')).toBeTruthy();
  });

  it('renders the user management table for admin users', () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
    });

    render(<AdminUsersPage />);

    expect(screen.getByText('User Management')).toBeTruthy();
    expect(screen.getByRole('button', { name: /invite user/i })).toBeTruthy();
    expect(screen.getByText('Admin One')).toBeTruthy();
    expect(screen.getByText('User Three')).toBeTruthy();
  });

  it('opens and closes the invite modal', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
    });

    render(<AdminUsersPage />);

    // Open modal
    const inviteBtn = screen.getByRole('button', { name: /invite user/i });
    fireEvent.click(inviteBtn);

    expect(screen.getByTestId('invite-user-modal')).toBeTruthy();

    // Close modal
    fireEvent.click(screen.getByText('Close Modal'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('invite-user-modal')).toBeNull();
    });
  });

  it('submits the invite modal and closes it', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
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
      expect(screen.queryByTestId('invite-user-modal')).toBeNull();
    });
    
    consoleSpy.mockRestore();
  });

  it('toggles user status', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
    });

    render(<AdminUsersPage />);

    // Initially active
    const blockButtons = screen.getAllByText('Block User');
    fireEvent.click(blockButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByText('Unblock User').length).toBeGreaterThan(0);
    });
  });

  it('deletes a user', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
    });

    render(<AdminUsersPage />);
    
    // Admin One exists
    expect(screen.getByText('Admin One')).toBeTruthy();

    const deleteButtons = screen.getAllByText('Delete User');
    fireEvent.click(deleteButtons[0]);

    // Dialog should be open
    expect(screen.getByTestId('dialog')).toBeTruthy();

    const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('Admin One')).toBeNull();
    });
  });
});
