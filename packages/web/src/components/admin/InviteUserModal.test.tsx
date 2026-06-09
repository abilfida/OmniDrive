import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InviteUserModal } from './InviteUserModal';

describe('InviteUserModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<InviteUserModal onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    expect(screen.getByText('Invite User')).toBeDefined();
    expect(screen.getByLabelText('Email Address')).toBeDefined();
    expect(screen.getByLabelText('Role')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
  });

  it('calls onSubmit with correct values', () => {
    render(<InviteUserModal onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    const emailInput = screen.getByLabelText('Email Address');
    const roleSelect = screen.getByLabelText('Role');
    const submitButton = screen.getByRole('button', { name: 'Send Invite' });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith('test@example.com', 'admin');
  });

  it('calls onClose when cancel is clicked', () => {
    render(<InviteUserModal onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close icon is clicked', () => {
    render(<InviteUserModal onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<InviteUserModal onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    const backdrop = screen.getByTestId('modal-backdrop');
    fireEvent.click(backdrop);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal content is clicked', () => {
    render(<InviteUserModal onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    const content = screen.getByTestId('modal-content');
    fireEvent.click(content);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<InviteUserModal onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
