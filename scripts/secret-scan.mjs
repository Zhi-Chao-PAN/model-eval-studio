import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'history';
if (!['history', 'staged'].includes(mode)) {
  console.error('Usage: node scripts/secret-scan.mjs [history|staged]');
  process.exit(2);
}

if (mode === 'staged') {
  const files = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: root, encoding: 'utf8' });
  if (files.status !== 0) process.exit(files.status ?? 2);
  const blocked = files.stdout.split('\0').filter(Boolean).filter((file) => {
    const name = file.split('/').at(-1);
    return (/^\.env(?:\.|$)/.test(name) && !/^\.env(?:\.[\w-]+)*\.example$/.test(name)) || /\.(?:pem|p12|pfx|key)$/i.test(name);
  });
  if (blocked.length) {
    console.error('Do not commit credential files. Use a value-free .env.example instead:\n' + blocked.join('\n'));
    process.exit(1);
  }
}

const localBinary = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');
const binary = process.env.GITLEAKS_BIN || (existsSync(localBinary) ? localBinary : 'gitleaks');
const args = ['git', '--redact=100', '--no-banner', '--config', join(root, '.gitleaks.toml')];
args.push(...(mode === 'staged' ? ['--pre-commit', '--staged'] : ['--log-opts=--all']));
args.push(root);
const result = spawnSync(binary, args, { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error('Credential scan could not run. Install Gitleaks >=8.30.1 (macOS: brew install gitleaks), or set GITLEAKS_BIN to its executable.');
}
process.exit(result.status ?? 2);
