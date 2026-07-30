#!/usr/bin/env node
/**
 * Flag `data-wh40k-hook` consumers that could pass vacuously.
 *
 * Moving a behavioural class onto `data-wh40k-hook` is safe for the TEMPLATE but
 * dangerous for the CONSUMER: most panel probes read through the match
 * (`el?.textContent ?? ''`, `Boolean(el)`, `?? 0`), so a hook that is renamed,
 * dropped, or mistyped turns the probe into a silently-green no-op rather than a
 * failure. `scripts/migrate-hook-classes.mjs` prints every consumer it rewrites
 * precisely so that review can happen; at 40+ sites, reading them by hand is how
 * one gets missed.
 *
 * A consumer is considered GUARDED when the same file asserts on what the query
 * produced — a count, a truthiness flag, or the element itself — via `expect(`.
 * The check is deliberately file-scoped and generous: it is a worklist generator,
 * not a proof. Its job is to shrink 44 files down to the handful worth reading.
 *
 * Usage: node scripts/hook-assertion-audit.mjs
 */
import { readFileSync } from 'node:fs';
import { walkFiles } from './lib/walk.mjs';

const ROOTS = ['tests', 'stories', 'src/module'];
const HOOK_RE = /\[data-wh40k-hook="([^"]+)"\]/g;

/** Files that query a hook, with the hooks each one queries. */
const consumers = new Map();
for (const root of ROOTS) {
    for (const file of walkFiles(root, ['.ts'])) {
        const text = readFileSync(file, 'utf8');
        const hooks = new Set();
        let m;
        while ((m = HOOK_RE.exec(text)) !== null) hooks.add(m[1]);
        if (hooks.size > 0) consumers.set(file, { hooks, text });
    }
}

/**
 * Whether a file is production code, as opposed to something that would notice a
 * selector breaking. Tests and stories live under `src/module` too (co-located),
 * so the path prefix alone is not enough.
 */
const isProduction = (file) => file.startsWith('src/module') && !file.endsWith('.test.ts') && !file.endsWith('.stories.ts');

/** Hooks any TEST or STORY queries — i.e. hooks something would notice breaking. */
const coveredHooks = new Set();
for (const [file, { hooks }] of consumers) {
    if (isProduction(file)) continue;
    for (const hook of hooks) coveredHooks.add(hook);
}

const unguarded = [];
for (const [file, { hooks, text }] of consumers) {
    // Production consumers are not tests and have no assertions to make. The risk
    // they carry is different: a selector nothing exercises can be silently broken
    // by a template edit and no suite will notice. So the question for them is
    // coverage, not assertion.
    if (isProduction(file)) {
        const uncovered = [...hooks].filter((h) => !coveredHooks.has(h));
        if (uncovered.length > 0) {
            unguarded.push({ file, hooks: uncovered, reason: 'production selector with no test or story querying it' });
        }
        continue;
    }
    // A spec that never asserts anything cannot fail on a broken selector.
    if (!text.includes('expect(')) {
        unguarded.push({ file, hooks: [...hooks], reason: 'no expect() in file' });
        continue;
    }
    // Storybook play functions assert via `expect` imported from the test runner;
    // treat any assertion as evidence the file checks its own DOM reads.
    const assertsCount = /expect\([^)]*\b(count|length|Count)\b/.test(text);
    const assertsTruth = /expect\([^)]*\)[^;]*\.toBe\((true|\d+)\)/.test(text);
    const assertsNotNull = /expect\([^)]*\)[^;]*\.(not\.toBeNull|toBeTruthy|toBeDefined)\(/.test(text);
    // The failure-collector idiom several panel specs use: each missing element
    // pushes a message, and the run asserts the list came back empty. A missing
    // hook fails it, so it is guarded — just not by asserting on the element.
    const assertsEmptyCollector = /expect\((failures|errors|problems|missing)[^)]*\)[^;]*\.toEqual\(\[\]\)/.test(text);
    if (!assertsCount && !assertsTruth && !assertsNotNull && !assertsEmptyCollector) {
        unguarded.push({ file, hooks: [...hooks], reason: 'no count/truthiness/existence assertion found' });
    }
}

console.log(`${consumers.size} file(s) query a data-wh40k-hook selector`);
if (unguarded.length === 0) {
    console.log('all of them assert on what the query produced');
    process.exit(0);
}
console.log(`\n${unguarded.length} file(s) need a look:\n`);
for (const { file, hooks, reason } of unguarded) {
    console.log(`  ${file}\n      ${reason}\n      hooks: ${hooks.join(', ')}`);
}
