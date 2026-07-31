#!/usr/bin/env node
/**
 * Unconsumed-module ratchet: the count of `src/module/` modules that no
 * production module imports cannot rise. Auto-flips to strict at 0.
 *
 * This is the metric #514 needs and `no-orphans` does not provide — that rule
 * only fires on modules with neither dependents nor dependencies, so it misses
 * every dead module that happens to import a helper (5 seen vs 37 real).
 *
 * Update via `pnpm unconsumed:ratchet:update` after wiring or deleting a module.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const BASELINE = resolve(process.cwd(), '.unconsumed-baseline');
const updateMode = process.argv.slice(2).includes('--update');

const report = JSON.parse(execFileSync('node', ['scripts/unconsumed-coverage.mjs', '--json'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));

const cur = { unconsumed: report.unconsumed, strict: report.unconsumed === 0 };

function write(state) {
    writeFileSync(BASELINE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

if (updateMode) {
    write(cur);
    console.log(`[unconsumed-ratchet] baseline updated: unconsumed=${cur.unconsumed}${cur.strict ? ' (STRICT — must remain 0)' : ''}`);
    process.exit(0);
}

if (!existsSync(BASELINE)) {
    write(cur);
    console.log(`[unconsumed-ratchet] baseline file missing — initialised: unconsumed=${cur.unconsumed}`);
    process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

if (base.strict === true && cur.unconsumed > 0) {
    console.error('[unconsumed-ratchet] FAIL — this metric graduated to strict at 0 and must remain there.');
    console.error(`  unconsumed: 0 -> ${cur.unconsumed}`);
    console.error('  Wire the module to a real consumer, or delete it with its tests. There is no --update escape.');
    console.error(`  Offenders: run \`node scripts/unconsumed-coverage.mjs --list\``);
    process.exit(1);
}

if (cur.unconsumed > base.unconsumed) {
    console.error('[unconsumed-ratchet] FAIL — a module lost its last production consumer:');
    console.error(`  unconsumed: ${base.unconsumed} -> ${cur.unconsumed} (+${cur.unconsumed - base.unconsumed})`);
    console.error('  A module nothing imports is a feature the player cannot reach, and its tests are');
    console.error('  coverage over code that never runs. Wire it, or delete it with its tests.');
    console.error(`  Offenders: run \`node scripts/unconsumed-coverage.mjs --list\``);
    process.exit(1);
}

// Persist the graduation the moment it is earned, exactly like the other
// auto-flipping ratchets — in check mode too, not only under --update.
if (cur.unconsumed === 0 && base.strict !== true) {
    write(cur);
    console.log('[unconsumed-ratchet] GRADUATED: unconsumed reached 0 and is now strict. Commit .unconsumed-baseline.');
    process.exit(0);
}

if (cur.unconsumed < base.unconsumed) {
    console.log(`[unconsumed-ratchet] OK: unconsumed ${base.unconsumed} -> ${cur.unconsumed}. Lower the baseline: pnpm unconsumed:ratchet:update`);
} else {
    console.log(`[unconsumed-ratchet] OK: unconsumed=${cur.unconsumed} (unchanged)${base.strict === true ? ', strict' : ''}.`);
}
