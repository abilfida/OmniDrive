# Omnidrive Deployment & Onboarding CLI Design

## 1. Overview
The goal of this feature is to provide a seamless, interactive command-line onboarding experience for developers and self-hosters. Rather than manually running multiple setup commands, users will run a single `deploy.sh` script that guides them through configuring and deploying Omnidrive.

## 2. Architecture & Components

The onboarding tool consists of two main parts:

### A. `deploy.sh` (Bash Wrapper)
- **Purpose**: Act as the single entry point.
- **Responsibilities**:
  - Check if core system dependencies are installed: `node`, `npm`, `docker`, and `git`.
  - Run `npm install` to ensure all monorepo dependencies (and CLI UI libraries) are ready.
  - Execute the interactive Node.js script.

### B. `scripts/onboard-deploy.mjs` (Interactive CLI)
- **Purpose**: Manage the interactive UI and deployment logic.
- **Libraries**: Uses `@clack/prompts` for beautiful, interactive terminal elements and `chalk`/`picocolors` for styling.
- **Responsibilities**:
  - Present options.
  - Gather user input (OAuth credentials, ports, etc.).
  - Execute specific build/deployment commands based on the selected target.

## 3. Interactive Flow

### 3.1 Initial Checks & Welcome
- Welcome the user to Omnidrive.
- Early dependency check (especially `docker` and `npm`).

### 3.2 Target Selection
The user is prompted to choose a deployment target:
1. **Cloudflare (Production)**
2. **Docker Compose (Self-hosted)**
3. **Local Development**

### 3.3 Flow: Docker Compose (Self-hosted)
1. **Docker Check**: Ensure `docker` and `docker compose` are running.
2. **Port Configuration**: Prompt the user for the web server port (default: 3000). This prevents conflicts with other running apps.
3. **OAuth Gathering**: Prompt for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. **Secret Generation**: Automatically generate secure random strings for `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`.
5. **Environment Setup**: Write all gathered variables (including the custom port) into a `.env` file at the root level, which `docker-compose.yml` will consume.
6. **Deployment**: Run `docker compose up -d --build`.
7. **Success Screen**: Show the local URL (e.g., `http://localhost:<PORT>`).

### 3.4 Flow: Cloudflare (Production)
1. **Auth Check**: Run `npx wrangler whoami`. If not logged in, pause and ask the user to run `npx wrangler login`.
2. **Database Provisioning**:
   - Automatically run `npx wrangler d1 create omnidrive-prod` (if not exists) and update `wrangler.toml`.
   - Automatically run `npx wrangler kv namespace create KV_PROD` and update `wrangler.toml`.
3. **OAuth Gathering**: Prompt for Google OAuth credentials.
4. **Secret Injection**: Generate internal secrets and push them via `npx wrangler secret put`.
5. **Deployment**: Trigger the existing `make deploy-worker` and `make deploy-web` commands.
6. **Success Screen**: Provide the production URL from Cloudflare Pages.

### 3.5 Flow: Local Development
1. **Database Provisioning**: Run local D1 creation (`npx wrangler d1 execute ... --local`) and local KV setup.
2. **OAuth Gathering**: Prompt for Google OAuth credentials and write to `packages/worker/.dev.vars`.
3. **Frontend Env**: Ensure `packages/web/.env` is initialized.
4. **Run**: Execute `npm run dev` and attach the process to the terminal.

## 4. Error Handling
- **Graceful Exits**: If the user presses `Ctrl+C`, the CLI should exit cleanly with a friendly message.
- **Command Failures**: If a `wrangler` or `docker` command fails, capture the stderr, display it clearly, and suggest a fix rather than throwing a raw exception.
