# Design: Optional Google Auth Credentials

## Context
Omnidrive supports connecting Google Drives via Service Account JSONs or Google OAuth. Currently, the deployment wizard requires Google OAuth `Client ID` and `Client Secret` to be provided. To lower the friction of onboarding, these credentials should be optional, as users can rely entirely on Service Accounts.

## Requirements
1. The onboarding CLI should ask users if they want to configure Google OAuth.
2. If skipped, the deployment should proceed smoothly with empty credentials.
3. The backend should gracefully reject OAuth connection attempts if credentials are not configured.

## Architecture & Changes

### 1. CLI Onboarding (`scripts/onboard-deploy.mjs`)
- Add a `confirm` prompt using `@clack/prompts` asking: "Do you want to configure Google OAuth Credentials now? (You can skip this if you plan to use a Service Account later)".
- If `true`, present the `text` prompts for `Client ID` and `Client Secret`.
- If `false`, default both values to empty strings (`""`).
- The secrets generation and `.env` write steps will use these variables without modification (resulting in empty values in `.env` and Cloudflare Secrets).

### 2. API Backend Protection (`packages/worker/src/routes/drives.ts` & `auth.ts`)
- Add a guard clause at the beginning of the `GET /connect` route (and any other route that initiates an OAuth flow).
- The guard clause will check:
  ```typescript
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, 'Google OAuth is not configured. Please use a Service Account JSON to connect your drives.');
  }
  ```
- This prevents the application from generating invalid OAuth redirect URLs and surfaces a clear error to the frontend if a user attempts to use the OAuth method.

## Security & Trade-offs
- **Login Flow**: The core registration/login flow uses local username/password, so the admin can still log into the dashboard without Google OAuth.
- **Frontend UX**: We leave the frontend untouched for now. The "Connect with Google" button will still be visible, but clicking it will result in a clean 400 error message from the API. (Hiding the button dynamically would require adding an extra config endpoint, which adds unnecessary complexity for this iteration).
