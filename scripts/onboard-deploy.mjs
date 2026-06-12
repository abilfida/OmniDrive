import { intro, outro, select, text, isCancel, cancel, spinner } from '@clack/prompts';
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
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function checkCancel(val) {
  if (isCancel(val)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  return val;
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

    const port = checkCancel(await text({
      message: 'What port should the web server run on?',
      initialValue: '3000',
    }));

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

    const s = spinner();
    s.start('Generating secrets and configuring environment...');

    const jwtSecret = generateSecret(32);
    const tokenEncryptionKey = generateSecret(32);

    const envContent = `PORT=${port}\nGOOGLE_CLIENT_ID=${clientId}\nGOOGLE_CLIENT_SECRET=${clientSecret}\nJWT_SECRET=${jwtSecret}\nTOKEN_ENCRYPTION_KEY=${tokenEncryptionKey}\n`;
    fs.writeFileSync('.env', envContent);

    s.stop('Environment configured in .env file.');

    console.log(pc.cyan('Starting Docker Compose...'));
    runCmd('docker compose up -d --build');
    
    outro(pc.green(`✅ Deployed successfully! Open http://localhost:${port}`));
  } else if (target === 'cloudflare') {
    // Cloudflare flow
    outro(pc.green('Cloudflare deployment selected! (To be implemented)'));
  } else if (target === 'local') {
    // Local flow
    outro(pc.green('Local development selected! (To be implemented)'));
  }
}

main().catch(console.error);
