import { app } from './packages/worker/src/index.ts';

async function run() {
  const req = new Request('http://localhost/api/drives/0cfcec22-2f13-40ce-9dfc-1aae9c42ecdd/folders/root');
  // bypass authGuard by modifying req or just checking if authGuard fails
  // Actually, we can just inject a dummy mock for authGuard? No, authGuard looks at cookies or Auth header.
  console.log('Testing...');
}
run();
