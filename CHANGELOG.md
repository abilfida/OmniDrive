# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
