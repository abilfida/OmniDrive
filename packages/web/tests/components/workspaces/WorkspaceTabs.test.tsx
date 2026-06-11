import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkspaceMembersTab } from '../../../src/components/workspaces/WorkspaceMembersTab';
import { WorkspaceSettingsTab } from '../../../src/components/workspaces/WorkspaceSettingsTab';
import { WorkspaceFilesTab } from '../../../src/components/workspaces/WorkspaceFilesTab';

// Mock FileGrid to avoid complex dependencies
vi.mock('../../../src/components/files/FileGrid', () => ({
  FileGrid: () => <div data-testid="file-grid-mock">FileGrid Mock</div>
}));

describe('Workspace Tab Components', () => {
  it('renders Members tab placeholder', () => {
    render(<WorkspaceMembersTab />);
    expect(screen.getByText('Members (Coming Soon)')).toBeDefined();
  });

  it('renders Settings tab Storage & Quota section', () => {
    render(<WorkspaceSettingsTab workspaceId="test-workspace-id" />);
    expect(screen.getByText('Storage & Quota')).toBeDefined();
  });

  it('renders Files tab with FileGrid mock', () => {
    const mockProps = {
      files: [], subfolders: [], getDriveInfo: vi.fn().mockReturnValue({ drive: {}, index: 0 }), onNavigateFolder: vi.fn(),
      onPreviewFile: vi.fn(), onShare: vi.fn(), onRenameFile: vi.fn(), onDeleteFile: vi.fn(),
      onMoveDrive: vi.fn(), isTargetShared: vi.fn(), errorDrives: new Set<string>(), onViewInfo: vi.fn()
    };
    render(<WorkspaceFilesTab {...mockProps} />);
    expect(screen.getByTestId('file-grid-mock')).toBeDefined();
  });
});
