#!/usr/bin/env node
// DRY-TODO ratchet.
//
// Counts `TODO(dry)` markers under src/ (each tags a known DRY/abstraction
// debt from the codebase audit). The count may only fall:
//   - increase  -> commit blocked (don't add new DRY debt unannounced)
//   - decrease  -> baseline auto-lowers and is staged into the same commit
//   - missing   -> baseline self-initialises at the current count
//
// Flags: --update (force baseline to current), --list (print locations).
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, '.dry-todo-baseline');
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.hbs']);
const TOKEN = /TODO\(dry\)/g;

function walk(dir, out) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (EXT.has(extname(name))) out.push(p);
    }
    return out;
}

const hits = [];
let count = 0;
for (const f of walk(SRC, [])) {
    const m = readFileSync(f, 'utf8').match(TOKEN);
    if (m) {
        count += m.length;
        hits.push(`${f.slice(ROOT.length + 1)}: ${m.length}`);
    }
}
hits.sort();

if (process.argv.includes('--list')) {
    console.log(`TODO(dry) markers: ${count}`);
    for (const h of hits) console.log('  ' + h);
    process.exit(0);
}

const save = (n) => writeFileSync(BASELINE, JSON.stringify({ count: n }, null, 2) + '\n');
const stage = () => {
    try {
        execFileSync('git', ['add', BASELINE], { stdio: 'ignore' });
    } catch {
        /* not a git context — fine */
    }
};

if (process.argv.includes('--update') || !existsSync(BASELINE)) {
    save(count);
    stage();
    console.log(`[dry-todo] baseline set to ${count}`);
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).count;

if (count > baseline) {
    console.error(
        `[dry-todo] FAIL: ${count} TODO(dry) markers, baseline ${baseline}. ` +
            `Resolve a DRY debt before adding a new marker — the count may only fall.`,
    );
    for (const h of hits) console.error('  ' + h);
    process.exit(1);
}

if (count < baseline) {
    save(count);
    stage();
    console.log(`[dry-todo] ratcheted down ${baseline} -> ${count}`);
    process.exit(0);
}

console.log(`[dry-todo] OK (${count}, baseline ${baseline})`);
