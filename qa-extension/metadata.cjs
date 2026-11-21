'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../extension');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const pkg = read('package.json');
assert.equal(pkg.name, 'cppstart-run');
assert.equal(pkg.publisher, 'cppstart');
assert.equal(pkg.version, '2.2.0');
assert.equal(pkg.engines.vscode, '^1.83.0');
assert.equal(pkg.author.name, 'Associate Professor Mostafa Abotaleb');
assert(pkg.categories.includes('Education'));
assert(pkg.contributes.commands.some(c => c.command === 'cppstart.setup'));
assert.equal(pkg.capabilities.untrustedWorkspaces.supported, false);
assert(fs.statSync(path.join(root, pkg.icon)).size > 0);
const keys = [...new Set([...JSON.stringify(pkg).matchAll(/%([a-zA-Z]+)%/g)].map(m => m[1]))];
const runtime = read('l10n/bundle.l10n.json');
for(const tag of ['', '.ar', '.bn', '.ru']) {
 const locale = read('package.nls' + tag + '.json');
 assert(keys.every(k => locale[k] && typeof locale[k] === 'string'));
 assert(Object.keys(runtime).every(k => read('l10n/bundle.l10n' + tag + '.json')[k]));
}
console.log('PASS Marketplace identity, author, icon, categories, engine floor and locales. All four languages have every command and UI string.');
