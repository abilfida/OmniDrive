// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AdminUsersPage } from './AdminUsersPage';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';

// Mock the auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

// Mock API
vi.mock('../lib/api', () => ({
  api: {
    getAdminUsers: vi.fn(),
    adminCreateUser: vi.fn(),
    getInvitations: vi.fn(),
    createInvitation: vi.fn(),
    deleteInvitation: vi.fn(),
  }
}));

// Mock the lucide-react icons
vi.mock('lucide-react', () => ({
  ShieldAlert: () => <div data-testid="shield-alert-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  MoreVertical: () => <div data-testid="more-vertical-icon" />,
  X: () => <div data-testid="x-icon" />,
}));

vi.mock('../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, onSelect }: any) => (
    <button data-testid="dropdown-item" onClick={onClick || onSelect}>{children}</button>
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
    (api.getAdminUsers as Mock).mockResolvedValue({ users: [] });
    (api.getInvitations as Mock).mockResolvedValue({ invitations: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders access denied for non-admin users', () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'user1', role: 'member' },
    });

    render(<AdminUsersPage />);

    expect(screen.getByText('Access Denied')).toBeTruthy();
    expect(screen.getByText('You do not have permission to view this page.')).toBeTruthy();
  });

  it('renders the user management page for admin users', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
    });

    render(<AdminUsersPage />);

    expect(await screen.findByText('Users')).toBeTruthy();
    expect(screen.getByRole('button', { name: /add user/i })).toBeTruthy();
    expect(api.getAdminUsers).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the add user modal', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
    });

    render(<AdminUsersPage />);

    // Open modal
    const addBtn = await screen.findByRole('button', { name: /add user/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Add User', { selector: 'h3' })).toBeTruthy();

    // Close modal
    fireEvent.click(screen.getByText('Cancel'));
    
    await waitFor(() => {
      expect(screen.queryByText('Add User', { selector: 'h3' })).toBeNull();
    });
  });

  it('toggles tabs and loads invitations', async () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      user: { id: 'admin1', role: 'super_admin' },
    });

    render(<AdminUsersPage />);
    
    expect(api.getAdminUsers).toHaveBeenCalledTimes(1);

    const invTab = await screen.findByText('Invitation Codes');
    fireEvent.click(invTab);

    expect(api.getInvitations).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Create Code')).toBeTruthy();
  });
});
