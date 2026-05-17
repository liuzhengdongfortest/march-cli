import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const envFile = readFileSync('.env', 'utf8');
const tokenLine = envFile
  .split(/\r?\n/)
  .find((line) => line.trim().startsWith('NPM_TOKEN='));
const token = tokenLine?.slice('NPM_TOKEN='.length).trim();

if (!token) {
  console.error('Missing NPM_TOKEN in .env');
  process.exit(1);
}

const npmConfigKey = 'npm_config_//registry.npmjs.org/:_authToken';
const result = spawnSync('npm', ['publish'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NPM_TOKEN: token,
    [npmConfigKey]: token,
  },
});

process.exit(result.status ?? 1);
