#!/usr/bin/env node
/**
 * Fail fast when .env.local points at local Supabase but nothing listens on :54321.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env.local');

if (!existsSync(envPath)) {
  console.error('Missing .env.local — copy from .env.local.example');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const isLocal =
  url.includes('127.0.0.1:54321') || url.includes('localhost:54321');

if (!isLocal) {
  process.exit(0);
}

const healthUrl = url.replace(/\/$/, '') + '/rest/v1/';
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

try {
  const res = await fetch(healthUrl, {
    headers: key ? { apikey: key } : {},
    signal: AbortSignal.timeout(3000),
  });
  if (res.ok || res.status === 401) {
    process.exit(0);
  }
} catch {
  // fall through
}

console.error(`
Supabase local não está rodando (nada em ${url}).

O app Next.js (npm run dev ou Docker) depende desse serviço. Suba o stack:

  npm run supabase:start

Depois reinicie o app. Studio: http://127.0.0.1:54323
`);
process.exit(1);
