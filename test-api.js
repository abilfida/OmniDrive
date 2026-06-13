import { fetch } from 'undici';

async function run() {
  const res = await fetch('http://localhost:8080/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123' })
  });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}
run();
