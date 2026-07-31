#!/usr/bin/env node
/**
 * Count modules under `src/module/` that NO production module imports.
 *
 * Why this exists separately from dependency-cruiser's `no-orphans`: that rule
 * fires only when a module has neither dependents NOR dependencies. A dead
 * module that happens to import one helper is therefore INVISIBLE to it. At the
 * time of writing `no-orphans` reported 5 while the real count was 37 — the
 * metric saw one in seven. `rules/dw-distinction.ts` is the clean example: 161
 * lines, fully unit-tested, zero production callers, unflagged, because it
 * imports `dw-renown.ts`.
 *
 * "Unconsumed" is the thing that actually matters — a module nothing reaches is
 * a feature the player cannot get to, and its green tests are coverage over code
 * that never runs. Entry points (the system main, ambient declarations, generated
 * registries, test-only infrastructure) are legitimately importer-less and are
 * excluded.
 *
 * Tests and stories do NOT count as consumers: being imported by its own spec is
 * exactly the state this measures.
 *
 * Usage:
 *   node scripts/unconsumed-coverage.mjs           # write report + print summary
 *   node scripts/unconsumed-coverage.mjs --json    # JSON on stdout
 *   node scripts/unconsumed-coverage.mjs --list    # print every unconsumed module
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUT = '.unconsumed-coverage.json';
const args = new Set(process.argv.slice(2));

/**
 * Modules that are legitimately imported by nothing:
 *   - the system entry point Foundry itself loads;
 *   - ambient/generated declaration files;
 *   - test-only infrastructure, reached solely from *.test.ts (which the graph excludes).
 * Mirrors the `pathNot` exemptions on dependency-cruiser's `no-orphans` rule.
 */
const ENTRY_POINT = /^src\/module\/wh40k-rpg\.ts$|\.d\.ts$|registry\.generated\.ts$|^src\/module\/testing\//;

const raw = execFileSync('pnpm', ['exec', 'depcruise', '--config', '.dependency-cruiser.cjs', '--output-type', 'json', 'src/module'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
});
const graph = JSON.parse(raw);

/** module source -> number of production modules importing it. */
const importerCount = new Map();
for (const mod of graph.modules) importerCount.set(mod.source, importerCount.get(mod.source) ?? 0);
for (const mod of graph.modules) {
    for (const dep of mod.dependencies ?? []) {
        importerCount.set(dep.resolved, (importerCount.get(dep.resolved) ?? 0) + 1);
    }
}

const outgoing = new Map(graph.modules.map((m) => [m.source, (m.dependencies ?? []).length]));

const unconsumed = [...importerCount.entries()]
    .filter(([mod, count]) => count === 0 && mod.startsWith('src/module/') && !ENTRY_POINT.test(mod))
    .map(([mod]) => mod)
    .sort();

// Split by whether `no-orphans` would already report it, so the two metrics'
// relationship stays legible and a drop in one is attributable.
const alsoOrphan = unconsumed.filter((m) => (outgoing.get(m) ?? 0) === 0);
const hiddenFromOrphans = unconsumed.filter((m) => (outgoing.get(m) ?? 0) > 0);

const report = {
    generatedAt: new Date().toISOString(),
    total: graph.modules.filter((m) => m.source.startsWith('src/module/')).length,
    unconsumed: unconsumed.length,
    alsoReportedByNoOrphans: alsoOrphan.length,
    hiddenFromNoOrphans: hiddenFromOrphans.length,
    modules: unconsumed,
};

if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(0);
}

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`[unconsumed-coverage] ${report.unconsumed} of ${report.total} modules under src/module/ have no production importer.`);
console.log(`  also reported by no-orphans: ${report.alsoReportedByNoOrphans}`);
console.log(`  invisible to no-orphans:     ${report.hiddenFromNoOrphans}  (they import something, so the rule skips them)`);

if (args.has('--list')) {
    console.log('');
    for (const mod of unconsumed) console.log(`  ${mod}${(outgoing.get(mod) ?? 0) === 0 ? '' : '   [hidden from no-orphans]'}`);
}

console.log(`\nReport written to ${OUT}.`);
