# User Management and Sign Up Refactor Design

## Context
The goal is to streamline the "User Management" interface in the admin panel and unify the data input for creating users with the sign-up process. The current flow uses an email-based invite system alongside a separate invitation code system. This refactor replaces the email invite with a direct "Add User" form in the admin panel, integrates the Invitation Code management directly into the Users page, and aligns the input fields across both the public Sign Up form and the admin's Add User form.

## 1. Navigation & Page Titles
- **Sidebar Menu:** Rename "User Management" to "Users".
- **Page Title:** Update the H1 on the `AdminUsersPage` from "User Management" to "Users".

## 2. Admin Users Page Layout
The `AdminUsersPage` will adopt a Tabbed layout to consolidate user administration and invitation code management.
- **Tab 1: Active Users**
  - Displays the existing table of users (Name, Username, Email, Role, Status, Actions).
  - The "Invite User" button is replaced by an "Add User" button.
- **Tab 2: Invitation Codes**
  - Incorporates the form to generate new Invitation Codes (Code, Max Uses).
  - Displays the list of active/existing Invitation Codes.
  - This replaces the standalone `AdminInvitations` component view, removing redundant headings.

## 3. Unified User Creation Forms
Both the public Sign Up form and the Admin "Add User" form will share the same core fields. A new `Name` field is being added to the user registration flow.

### A. Public Sign Up Form (LoginPage.tsx)
Fields required for a user signing up independently:
- **Name** (New)
- **Username**
- **Email**
- **Password**
- **Invitation Code**
- *Note:* The role for users signing up via this form will default to `member`.

### B. Admin "Add User" Form (AdminUsersPage.tsx)
When an admin clicks "Add User" in the "Active Users" tab, a modal or inline form will appear with the following fields:
- **Name** (New)
- **Username**
- **Email**
- **Password**
- **Role** (Admin-only field to specify if the user is a `member` or `super_admin`)

## 4. Component Cleanup & Technical Notes
- **InviteUserModal:** The existing `InviteUserModal.tsx` will be repurposed or replaced by the new "Add User" modal that includes the fields specified above.
- **AdminInvitations:** The `AdminInvitations.tsx` logic and UI will be merged into the "Invitation Codes" tab on the `AdminUsersPage`.
- **Backend API Adjustments:** The `api.register` and admin user creation endpoints must be checked and updated if necessary to accept the new `name` field alongside the existing fields.
