import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const privateFile =
  process.env.REPLYFOLIO_PRIVATE_TEAM_FILE ||
  resolve(root, '../.replyfolio-private/team-bootstrap.sql');
let secrets = [];
try {
  const source = await readFile(privateFile, 'utf8');
  secrets = [...new Set(source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])];
} catch {
  if (process.env.REPLYFOLIO_PRIVATE_TEAM_FILE) throw new Error('Private team file unavailable');
}
const patterns = [
  /sb_secret_[a-z0-9_-]{15,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root },
)
  .toString()
  .split('\0')
  .filter(Boolean);
const scan = (path, source) => {
  if (secrets.some((s) => source.includes(s)) || patterns.some((p) => p.test(source)))
    throw new Error('Private information detected: ' + path);
};
for (const path of files) {
  scan(path, await readFile(resolve(root, path), 'utf8'));
}
if (secrets.length) {
  const history = execFileSync('git', ['log', '-p', '--all'], {
    cwd: root,
    maxBuffer: 30 * 1024 * 1024,
  }).toString();
  if (secrets.some((s) => history.includes(s)))
    throw new Error('Private team address found in Git history');
}
async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const path = resolve(dir, e.name);
    if (e.isDirectory()) await walk(path);
    else if (/\.(js|css|html|map|json)$/.test(path))
      scan(relative(root, path), await readFile(path, 'utf8'));
  }
}
await walk(resolve(root, 'dist'));
console.log('Repository, Git history and browser build passed privacy checks.');
