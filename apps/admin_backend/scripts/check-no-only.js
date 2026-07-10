const fs = require('fs');
const path = require('path');

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const focusedTestPattern =
  /\b(?:fit|fdescribe)\s*\(|\b(?:it|test|describe)\s*(?:\.\s*concurrent\s*)?\.\s*only\s*(?:\.\s*each\s*)?\(/;
const bad = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(entryPath);
      continue;
    }

    if (
      /(?:\.spec|\.e2e-spec)\.ts$/.test(entry.name) &&
      focusedTestPattern.test(fs.readFileSync(entryPath, 'utf8'))
    ) {
      bad.push(path.relative(root, entryPath));
    }
  }
}

walk(path.join(root, 'src'));
walk(path.join(root, 'test'));

if (bad.length) {
  console.error(`Focused tests committed with .only or focused aliases:\n${bad.join('\n')}`);
  process.exit(1);
}
