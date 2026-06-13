# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.10] - 2026-06-14

### Added

- **Docker Sync Resilience:**
  - Implemented chunked initial sync with checkpointing and state lock
  - Added `next_page_token` to `sync_state` schema to support resume-able syncs
  - Added OOM-safe generator based `iterateAllFilesAndFolders` to GoogleDriveService
  - Implemented startup DB cleanup and graceful shutdown handling (e.g. SIGTERM)
- **Agent Skills & Documentation:**
  - Added `publish-release` skill definition, design, and plan
  - Added Docker Sync Resilience plan and design specifications

### Fixed

- **Sync Stability:**
  - Improved sync logic and atomic upserts based on code review
  - Integrated `getIsShuttingDown` check into sync loops to prevent concurrent syncs
  - Refined Google Drive generator and cron behavior based on feedback


## [0.6.0] - 2026-06-12

### Added

- **File Selection & Bulk Actions:**
  - Added shift-click range selection and improved hit areas in the File Grid
  - Connected bulk "Move Drive" functionality to FilesPage, SearchPage, and DashboardPage
  - Upgraded `MoveDriveModal` to robustly handle bulk file operations
  - Refactored `BulkActionBar` to a new floating pill design
  - Added `selectMultiple` support to the selection store

### Fixed

- **Stability & Error Handling:**
  - Handled preview image error to prevent application crashes
  - Resolved double toast notifications and inconsistent error logic in `MoveDriveModal`
  - Corrected `MoveDriveModal` success logic to properly handle "all-skipped" edge cases
  - Fixed an issue where selection mode wouldn't automatically close upon location change
  - Fixed redundant logic in `handleItemClick` during file selection
  - Removed stray closing div causing build errors in `FilesPage`
  - Fixed broken and orphaned tests in `InviteUserModal` and `WorkspaceTabs` to ensure test suite integrity

### Changed (UI)

- **Aesthetics & Usability:**
  - Improved file and folder icons for a more polished and enterprise look
  - Increased spacing between icons and file names for better readability
  - Ensured the navigation toolbar remains visible during active file selection

## [0.5.0] - 2026-06-11

### Added

- **Performance & Load Optimization:**
  - Implemented keyset pagination (cursor-based) for folders API
  - Added infinite scroll fetching logic in workspace page
  - Implemented stale-while-revalidate caching for folders
  - Added hover prefetch and caching endpoint integration in `useMergedDrive`
- **User Management Refactoring:**
  - Updated backend auth and admin routes
  - Refactored `AdminUsersPage` and removed deprecated components
  - Hid current user actions in `AdminUsersPage` for safety
  - Updated sidebar and login page designs
- **Sync Tracking & Info Panel:**
  - Added sync tracking columns to the database/types
  - Added manual sync button and "last synced" info to the InfoPanel

### Fixed

- Resolved workspace race conditions and preserved infinite scroll on deletion
- Refactored `getFolderContents` and added limit support
- Addressed various TypeScript type errors in `useMergedDrive` and `InfoPanel`
- Reverted `getFolderContents` for native drive folders to `getDriveFolderContents`
- Enforced hiding of current user actions using username fallback in `AdminUsersPage`
- Correctly checked current user id in `AdminUsersPage`
- Removed unused `useAuthStore` in SettingsPage

## [0.4.0] - 2026-06-10

### Security

- **Comprehensive Security Hardening:**
  - Implemented CSRF guard middleware with Origin/Referer validation on all mutating API endpoints
  - Added in-memory sliding window rate limiting for authentication, shared link verification, and global APIs
  - Added security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, CSP)
  - Fixed IDOR vulnerabilities in shared link creation and downloading by enforcing ownership scoping
  - Hardened JWT signing by using a dedicated `JWT_SECRET` key and enforcing token expiration
  - Added AES-256-GCM encryption for Google OAuth tokens at rest in KV storage
  - Integrated PKCE (Proof Key for Code Exchange) S256 into the OAuth flow
  - Enforced strong password complexity requirements
  - Prevented SSRF (Server-Side Request Forgery) via webhook URL validation
  - Tightened CORS policy to strictly limit localhost access during development
  - Sanitized API error messages to prevent internal details leakage
  - Prevented role escalation when assigning workspace members
  - Enforced a 30-day absolute session lifetime limit

## [0.3.0] - 2026-06-10

### Added

- **User & Team Management:**
  - Dynamic user profile display in Header based on authentication state
  - Global `AdminUsersPage` for managing all users (restricted to admins)
  - Features to invite, block/unblock, and delete users
  - Proper UI components for invitations (`InviteUserModal`) and routing guards (`SetupGuard`)

### Fixed

- **Role Management:**
  - Standardized user roles to `super_admin` and `member` across backend and frontend.
  - Ensured new users correctly default to `member` role upon registration.
  - Prevented non-admin users from viewing or interacting with the "Admin: Invitation Codes" component in the settings page.

## [0.2.0] - 2026-06-09

### Added

- **Enterprise Workspace:**
  - Team Workspaces with Role-Based Access Control (RBAC)
  - Workspace Quotas and Data Retention Policies
  - Automated cron jobs for data retention and audit log cleanup
  - Comprehensive Audit Logging for workspace actions
  - Notion-style hierarchical workspace sidebar and tabbed interface
- **Search & Metadata (Phase 3):**
  - Unified Global Search with metadata filtering
  - Custom file metadata properties and editor
  - Visual metadata badges in the File Grid
- **Bulk Actions:**
  - Checkboxes for multiple file selection in Grid and List views
  - Bulk Move, Delete, and Add to Workspace operations
- **Database Management:**
  - `make reset-local` and `make reset-remote` for complete factory reset of D1 and KV data

### Changed

- Replaced Virtual Folders with the new Enterprise Workspace system in the frontend UI

## [0.1.0] - 2026-06-08

### Added

- Google OAuth authentication with session management (KV-backed, 7-day sliding window)
- Multi-Google Drive account support (OAuth and Service Account)
- Google Drive file sync — initial full sync and incremental sync via Changes API
- Cron-based automatic sync (every 30 minutes)
- Virtual folder system for cross-drive file organization
- Merged drive view with unified browsing across all connected drives
- File upload with drag-and-drop and smart drive selection (most free space)
- Breadcrumb navigation for folder hierarchy
- Password-protected shared links with expiry and download limits
- File automation rules engine — auto-move and auto-delete based on name/extension conditions
- Dark mode UI design system with Inter font
- Dashboard with aggregate storage stats across all drives
- File preview modal for images and documents
- Settings page for managing connected drives
