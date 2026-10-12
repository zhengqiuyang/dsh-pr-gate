/**
 * Vendor the deterministic core of agent-pr-gate into src/vendor/apg-core.
 *
 * The plugin is a thin Cordis adapter; the scope policy and residue rules
 * stay owned by the agent-pr-gate repository (CI gate, its own tests). This
 * script copies the three self-contained modules the live gate needs and
 * refuses to vendor anything that grew imports outside the closure.
 *
 * Usage: node scripts/sync-apg-core.mjs [--check]
 *   --check  verify the vendored copy is in sync, change nothing (CI guard)
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, '..');
const sourceRoot = process.env.APG_SRC
  ? resolve(pluginRoot, process.env.APG_SRC)
  : resolve(pluginRoot, '..', 'agent-pr-gate', 'src');
const vendorRoot = join(pluginRoot, 'src', 'vendor', 'apg-core');

/** The gate closure: scope policy (globMatch) + residue rules + shared types. */
const FILES = ['policy.ts', 'residue.ts', 'types.ts'];
/** Imports allowed inside vendored files: intra-closure, node builtins, yaml. */
const ALLOWED_IMPORTS = new Set(['./types.js', './policy.js', './residue.js', 'yaml']);

function importsOf(source) {
  const imports = [];
  for (const line of source.split('\n')) {
    const m = /^import\s(?:type\s)?(?:[^'"]*from\s)?['"]([^'"]+)['"]/.exec(line);
    if (m) imports.push(m[1]);
  }
  return imports;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  let dirty = false;

  await mkdir(vendorRoot, { recursive: true });

  for (const file of FILES) {
    const src = join(sourceRoot, file);
    if (!existsSync(src)) {
      console.error(`sync-apg-core: missing source ${src}`);
      console.error('Is the agent-pr-gate checkout a sibling of this plugin?');
      process.exit(1);
    }
    const source = await readFile(src, 'utf8');

    for (const spec of importsOf(source)) {
      const ok = ALLOWED_IMPORTS.has(spec) || spec.startsWith('node:');
      if (!ok) {
        console.error(`sync-apg-core: ${file} now imports "${spec}" — outside the gate closure.`);
        console.error('Extend FILES/ALLOWED_IMPORTS deliberately after reviewing that dependency.');
        process.exit(1);
      }
    }

    const dest = join(vendorRoot, file);
    const existing = existsSync(dest) ? await readFile(dest, 'utf8') : null;
    if (existing !== source) dirty = true;

    if (!checkOnly && existing !== source) {
      await copyFile(src, dest);
      console.log(`synced ${file}${existing === null ? ' (new)' : ' (updated)'}`);
    }
  }

  if (checkOnly) {
    if (dirty) {
      console.error('sync-apg-core: vendored copy is stale; run `npm run sync`.');
      process.exit(1);
    }
    console.log('sync-apg-core: vendored copy is in sync.');
  } else if (!dirty) {
    console.log('sync-apg-core: already in sync.');
  }
}

main();
