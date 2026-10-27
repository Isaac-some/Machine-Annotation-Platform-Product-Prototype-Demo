import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const build = spawnSync('npm', ['run', 'build:pages'], { cwd: 'openhandle', stdio: 'inherit', env: process.env });
if (build.status !== 0) process.exit(build.status ?? 1);
const destination = 'public/sites/hawk/openhandle';
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync('openhandle/pages-dist', destination, { recursive: true });
