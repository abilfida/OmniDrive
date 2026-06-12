import { intro, outro, select, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';

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
    // Docker flow
    outro(pc.green('Docker deployment selected! (To be implemented)'));
  } else if (target === 'cloudflare') {
    // Cloudflare flow
    outro(pc.green('Cloudflare deployment selected! (To be implemented)'));
  } else if (target === 'local') {
    // Local flow
    outro(pc.green('Local development selected! (To be implemented)'));
  }
}

main().catch(console.error);
