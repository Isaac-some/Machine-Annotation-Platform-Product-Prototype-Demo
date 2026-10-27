import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const generated = process.argv.includes('--output');
const roots = generated ? ['out'] : ['src', 'openhandle', 'public', 'scripts', '.github', 'README.md', 'package.json', 'package-lock.json'];
const excluded = new Set(['node_modules', '.git', '.next', 'pages-dist']);
const failures = [];
const forbidden = [
  ['internal host', /(?:tucdev|ituchong|tuchong|bytedance|larksuite)\.(?:com|cn)|console\.volcengine\.com/i],
  ['personal local path', /\/(?:Users|private\/tmp)\/[A-Za-z0-9_/-]+/],
  ['private network address', /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['access credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b/],
  ['phone number', /(?<![\w\d])1[3-9]\d{9}(?![\w\d])/],
];
function visit(file) {
  if (!statSync(file).isDirectory()) {
    if (/(?:^|\/)(?:\.env[^/]*|App_Secret[^/]*|transcript[^/]*|recording[^/]*)$|\.(?:mp4|mov|m4v|mp3|wav|zip|har)$/i.test(file)) failures.push({ file, reason: 'private recording, export or environment file' });
    if (!/\.(?:[cm]?[jt]sx?|json|html|css|svg|ya?ml|md|txt)$/.test(file) || file === 'scripts/audit-public.mjs') return;
    const text = readFileSync(file, 'utf8');
    for (const [reason, pattern] of forbidden) if (pattern.test(text)) failures.push({ file, reason });
    return;
  }
  for (const entry of readdirSync(file)) if (!excluded.has(entry)) visit(path.join(file, entry));
}
for (const root of roots) visit(root);
if (!generated) {
  const catalog = JSON.parse(readFileSync('openhandle/app/data/operators.json', 'utf8'));
  if (!catalog.every(operator => operator.id.startsWith('demo.') && operator.confidence === 'demo' && operator.config.every(field => field.defaultValue === ''))) failures.push({ file: 'operator catalog', reason: 'non-demo definition or populated default' });
  const shell = readFileSync('src/components/sites/hawk/hawk-shell.tsx', 'utf8');
  if (/https?:\/\//.test(shell) || /通用模板|内部模型工具|AI数据内控矩阵|供应商管理/.test(shell)) failures.push({ file: 'platform navigation', reason: 'non-platform entry' });
}
if (failures.length) { console.error(JSON.stringify({ passed: false, failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ passed: true, scope: generated ? 'generated website' : 'public application source', demoOnly: true }));
