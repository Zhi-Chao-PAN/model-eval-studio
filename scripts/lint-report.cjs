// Temporary lint report helper - reads eslint JSON from stdin and prints
// grouped/located issues for targeted cleanup.
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const targets = (process.argv[2] || '').split(',').filter(Boolean);
const byRule = {};
const lines = [];
for (const f of data) {
  for (const m of f.messages || []) {
    if (targets.length && !targets.includes(m.ruleId)) continue;
    const rel = f.filePath.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
    byRule[m.ruleId] = (byRule[m.ruleId] || 0) + 1;
    lines.push(`${rel}:${m.line}:${m.column}  [${m.ruleId}]  ${m.message}`);
  }
}
console.log('--- counts by rule ---');
for (const k of Object.keys(byRule).sort((a, b) => byRule[b] - byRule[a])) {
  console.log(String(byRule[k]).padStart(4), k);
}
console.log('--- locations ---');
for (const l of lines) console.log(l);
