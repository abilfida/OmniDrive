import { intro, outro, select, text, isCancel, cancel, spinner, confirm } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';

function runCmd(cmd) {
  try {
    return execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    cancel(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

function runCmdSilent(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return null;
  }
}

function generateSecret(length = 32) {
  return crypto.randomBytes(length / 2).toString('hex');
}

function checkCancel(val) {
  if (isCancel(val)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  return val;
}

async function getOAuthCredentials() {
  const useOAuth = checkCancel(await confirm({
    message: 'Do you want to configure Google OAuth Credentials now? (You can skip this if you plan to use a Service Account later)',
    initialValue: true,
  }));

  if (!useOAuth) return { clientId: '', clientSecret: '' };

  const clientId = checkCancel(await text({
    message: 'Enter your Google OAuth Client ID:',
    validate(value) {
      if (value.length === 0) return 'Client ID is required';
    }
  }));

  const clientSecret = checkCancel(await text({
    message: 'Enter your Google OAuth Client Secret:',
    validate(value) {
      if (value.length === 0) return 'Client Secret is required';
    }
  }));

  return { clientId, clientSecret };
}

async function main() {
  intro(pc.inverse(' Welcome to Omnidrive Deployment Wizard '));

  const target = checkCancel(await select({
    message: 'Where do you want to deploy Omnidrive?',
    options: [
      { value: 'docker', label: '🐳 Docker Compose (Self-hosted)' },
      { value: 'cloudflare', label: '☁️ Cloudflare (Production)' },
      { value: 'local', label: '💻 Local Development (npm run dev)' },
    ],
  }));

  if (target === 'docker') {
    const hasDocker = runCmdSilent('command -v docker');
    if (!hasDocker) {
      cancel('Docker is not installed. Please install Docker and try again.');
      process.exit(1);
    }

    const dockerRunning = runCmdSilent('docker info');
    if (!dockerRunning) {
      cancel('Docker daemon is not running. Please start Docker and try again.');
      process.exit(1);
    }

    const buildStrategy = checkCancel(await select({
      message: 'How do you want to run Docker Compose?',
      options: [
        { value: 'prebuilt', label: '📦 Use pre-built Docker image (Fastest)' },
        { value: 'source', label: '🛠️ Build from source' },
      ],
    }));

    if (fs.existsSync('.env')) {
      const overwrite = checkCancel(await confirm({
        message: '.env file already exists. Do you want to overwrite it?'
      }));
      if (!overwrite) {
        cancel('Setup cancelled. .env file not overwritten.');
        process.exit(0);
      }
    }

    const port = checkCancel(await text({
      message: 'What port should the web server run on?',
      initialValue: '3000',
      validate(value) {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 65535) {
          return 'Port must be a valid number between 1 and 65535';
        }
      }
    }));

    const { clientId, clientSecret } = await getOAuthCredentials();

    const s = spinner();
    s.start('Generating secrets and configuring environment...');

    const jwtSecret = generateSecret(32);
    const tokenEncryptionKey = generateSecret(32);

    const envContent = `PORT=${port}\nGOOGLE_CLIENT_ID=${clientId}\nGOOGLE_CLIENT_SECRET=${clientSecret}\nJWT_SECRET=${jwtSecret}\nTOKEN_ENCRYPTION_KEY=${tokenEncryptionKey}\n`;
    fs.writeFileSync('.env', envContent);

    s.stop('Environment configured in .env file.');

    console.log(pc.cyan('Starting Docker Compose...'));
    if (buildStrategy === 'source') {
      runCmd('docker compose up -d --build');
    } else {
      runCmd('docker compose up -d');
    }
    
    outro(pc.green(`✅ Deployed successfully! Open http://localhost:${port}`));
  } else if (target === 'cloudflare') {
    const whoami = runCmdSilent('npx wrangler whoami');
    if (!whoami || whoami.includes('You are not authenticated')) {
      console.log(pc.yellow('You are not logged in to Cloudflare. Please login now.'));
      runCmd('npx wrangler login');
    }

    const { clientId, clientSecret } = await getOAuthCredentials();

    const s = spinner();
    s.start('Provisioning Cloudflare resources (D1 & KV)...');

    const wranglerPath = 'packages/worker/wrangler.toml';
    const wranglerExamplePath = 'packages/worker/wrangler.example.toml';
    
    if (!fs.existsSync(wranglerPath)) {
      if (fs.existsSync(wranglerExamplePath)) {
        fs.copyFileSync(wranglerExamplePath, wranglerPath);
      }
    }

    // Create D1 if not exists
    let d1Output = runCmdSilent('npx wrangler d1 create omnidrive-prod');
    if (d1Output) {
      const d1Match = d1Output.match(/(?:database_id[=:]|"database_id":)\s*"([^"]+)"/);
      if (d1Match && d1Match[1] && fs.existsSync(wranglerPath)) {
        let toml = fs.readFileSync(wranglerPath, 'utf8');
        toml = toml.replace(/database_id = "[^"]+"/, `database_id = "${d1Match[1]}"`);
        fs.writeFileSync(wranglerPath, toml);
      }
    } else {
      console.log(pc.yellow('\nD1 creation failed or already exists. Proceeding with existing wrangler.toml...'));
    }
    
    // Create KV if not exists
    let kvOutput = runCmdSilent('npx wrangler kv namespace create KV_PROD');
    if (kvOutput) {
      const kvMatch = kvOutput.match(/(?:id[=:]|"id":)\s*"([^"]+)"/);
      if (kvMatch && kvMatch[1] && fs.existsSync(wranglerPath)) {
        let toml = fs.readFileSync(wranglerPath, 'utf8');
        // Look for KV id replacement
        toml = toml.replace(/id = "[^"]+"/, `id = "${kvMatch[1]}"`);
        fs.writeFileSync(wranglerPath, toml);
      }
    } else {
      console.log(pc.yellow('\nKV creation failed or already exists. Proceeding with existing wrangler.toml...'));
    }

    s.message('Pushing secrets to Cloudflare...');
    
    const jwtSecret = generateSecret(32);
    const tokenEncryptionKey = generateSecret(32);

    // Push secrets
    if (clientId) runCmdSilent(`echo "${clientId}" | npx wrangler secret put GOOGLE_CLIENT_ID -c packages/worker/wrangler.toml`);
    if (clientSecret) runCmdSilent(`echo "${clientSecret}" | npx wrangler secret put GOOGLE_CLIENT_SECRET -c packages/worker/wrangler.toml`);
    runCmdSilent(`echo "${jwtSecret}" | npx wrangler secret put JWT_SECRET -c packages/worker/wrangler.toml`);
    runCmdSilent(`echo "${tokenEncryptionKey}" | npx wrangler secret put TOKEN_ENCRYPTION_KEY -c packages/worker/wrangler.toml`);

    s.stop('Resources and secrets provisioned.');

    console.log(pc.cyan('Deploying to Cloudflare (Worker & Web)...'));
    // Make sure Make is available
    console.log(pc.cyan('Running remote D1 migrations...'));
    runCmd('npx wrangler d1 execute omnidrive --remote --file=packages/worker/src/db/schema.sql -c packages/worker/wrangler.toml');
    runCmd('make deploy-worker');
    runCmd('make deploy-web');
    
    outro(pc.green('✅ Deployed successfully to Cloudflare!'));
  } else if (target === 'local') {
    let proceedWithEnv = true;
    if (fs.existsSync('packages/worker/.dev.vars') || fs.existsSync('packages/web/.env')) {
      const overwrite = checkCancel(await confirm({
        message: 'Local environment files already exist. Do you want to overwrite them?'
      }));
      if (!overwrite) {
        proceedWithEnv = false;
      }
    }

    if (proceedWithEnv) {
      const { clientId, clientSecret } = await getOAuthCredentials();

      const s1 = spinner();
      s1.start('Setting up local environment...');

      const jwtSecret = generateSecret(32);
      const tokenEncryptionKey = generateSecret(32);

      const devVarsContent = `GOOGLE_CLIENT_ID=${clientId}\nGOOGLE_CLIENT_SECRET=${clientSecret}\nJWT_SECRET=${jwtSecret}\nTOKEN_ENCRYPTION_KEY=${tokenEncryptionKey}\n`;
      
      if (!fs.existsSync('packages/worker')) fs.mkdirSync('packages/worker', { recursive: true });
      fs.writeFileSync('packages/worker/.dev.vars', devVarsContent);

      if (!fs.existsSync('packages/web')) fs.mkdirSync('packages/web', { recursive: true });
      fs.writeFileSync('packages/web/.env', `VITE_API_URL=\n`);

      s1.stop('Local environment files created.');
    }

    const s2 = spinner();
    s2.start('Running local D1 migrations...');

    const wranglerPath = 'packages/worker/wrangler.toml';
    const wranglerExamplePath = 'packages/worker/wrangler.example.toml';
    if (!fs.existsSync(wranglerPath)) {
      if (fs.existsSync(wranglerExamplePath)) {
        fs.copyFileSync(wranglerExamplePath, wranglerPath);
      }
    }

    runCmdSilent('npx wrangler d1 execute omnidrive --local --file=packages/worker/src/db/schema.sql -c packages/worker/wrangler.toml');

    s2.stop('Local environment ready.');

    console.log(pc.cyan('Starting local development server...'));
    runCmd('npm run dev');
    
    outro(pc.green('✅ Local server stopped.'));
  }
}

main().catch(console.error);
