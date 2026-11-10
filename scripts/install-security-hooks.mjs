import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const optional = process.argv.includes('--if-local');
if (optional && (process.env.CI || process.env.VERCEL)) process.exit(0);
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
if (git('rev-parse', '--git-dir').status !== 0) {
  if (!optional) console.error('Install hooks from a Git checkout.');
  process.exit(optional ? 0 : 1);
}
const current = git('config', '--local', '--get', 'core.hooksPath').stdout.trim();
if (current && current !== '.githooks') {
  console.error('Existing core.hooksPath preserved. Integrate the credential hooks described in docs/credential-safety.md.');
  process.exit(optional ? 0 : 1);
}
const result = git('config', '--local', 'core.hooksPath', '.githooks');
if (result.status === 0) console.log('Credential checks installed for commit and push. Gitleaks is required; see docs/credential-safety.md.');
process.exit(result.status ?? 1);
