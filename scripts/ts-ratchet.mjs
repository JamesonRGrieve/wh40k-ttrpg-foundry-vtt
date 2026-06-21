#!/usr/bin/env node
/**
 * Per-rule, per-directory TS-strictness ratchet. Runs scripts/ts-coverage.mjs
 * (silently) and compares the result to .ts-coverage-baseline.
 *
 * Two enforcement modes per metric:
 *
 *   1. RATCHET (default) — any (metric, directory) pair regressing upward fails
 *      the commit. New directories are added at their current count; removed
 *      directories are dropped. Update via `pnpm ts:ratchet:update`.
 *
 *   2. STRICT — once a metric's global total reaches 0 it auto-graduates: the
 *      baseline marks the metric as "strict", and any further occurrence (in
 *      any directory) is a hard fail with no ratchet escape hatch. The
 *      `--update` flag does NOT un-strict a metric — you have to manually
 *      edit the baseline if you really need to (and then justify why the rule
 *      that was clean enough to graduate has regressed).
 *
 * The strict set lives in the baseline file as `"strict": ["tsIgnore", ...]`.
 *
 * This is independent of the `pnpm typecheck` hard gate — that gates total
 * tsc errors (must be zero); this gates the four manual-suppression patterns
 * agents are most likely to introduce when fixing types under time pressure.
 *
 * The graduate-at-0 / strict / persist state machine is shared with the other
 * keyed ratchets via scripts/lib/keyed-ratchet.mjs; this script keeps only its
 * per-directory count acquisition, its 2-D (dir × metric) ratchet comparison,
 * and its message wording.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { walkFiles } from './lib/walk.mjs';
import { runKeyedRatchet } from './lib/keyed-ratchet.mjs';

const REPORT = resolve(process.cwd(), '.ts-coverage.json');
const BASELINE = resolve(process.cwd(), '.ts-coverage-baseline');
const METRICS = ['any', 'asAny', 'tsExpectError', 'tsIgnore'];
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

const ROOT = resolve(process.cwd(), 'src/module');
const PATTERNS = {
    any: /(^|[^A-Za-z0-9_$]):\s*any\b/g,
    asAny: /\bas\s+any\b/g,
    tsExpectError: /@ts-expect-error\b/g,
    tsIgnore: /@ts-ignore\b/g,
};

const walk = (dir) => walkFiles(dir, { ext: '.ts', exclude: ['.d.ts', '.test.ts'] });

function topLevelDir(file) {
    const rel = relative(ROOT, file);
    const parts = rel.split(sep);
    return parts.length === 1 ? '_root' : parts[0];
}

function computeCounts() {
    const byDir = {};
    const byFile = {};
    const totals = Object.fromEntries(METRICS.map((m) => [m, 0]));
    let totalFiles = 0;

    for (const file of walk(ROOT)) {
        const source = readFileSync(file, 'utf8');
        const counts = Object.fromEntries(METRICS.map((m) => [m, 0]));
        for (const metric of METRICS) {
            const regex = new RegExp(PATTERNS[metric].source, PATTERNS[metric].flags);
            while (regex.exec(source) !== null) {
                counts[metric]++;
                totals[metric]++;
            }
        }

        const dir = topLevelDir(file);
        byDir[dir] ??= Object.fromEntries([...METRICS.map((m) => [m, 0]), ['files', 0]]);
        for (const metric of METRICS) byDir[dir][metric] += counts[metric];
        byDir[dir].files++;

        const rel = relative(process.cwd(), file);
        if (METRICS.some((metric) => counts[metric] > 0)) byFile[rel] = counts;
        totalFiles++;
    }

    const cur = {
        generatedAt: new Date().toISOString(),
        summary: { files: totalFiles, ...totals },
        byDir,
        byFile,
    };
    writeFileSync(REPORT, JSON.stringify(cur, null, 2) + '\n', 'utf8');

    // `counts` for the shared runner is the per-metric global total (drives
    // graduation/strict); `data` carries the full report for the 2-D ratchet.
    return { counts: { ...totals }, data: cur };
}

function pickBaselineShape(report, strict) {
    const out = { strict: [...strict].sort(), totals: {}, byDir: {} };
    for (const m of METRICS) out.totals[m] = report.summary[m];
    for (const d of Object.keys(report.byDir).sort()) {
        out.byDir[d] = {};
        for (const m of METRICS) out.byDir[d][m] = report.byDir[d][m];
    }
    return out;
}

runKeyedRatchet({
    baselinePath: BASELINE,
    label: 'ts-ratchet',
    updateMode,
    shape: {
        computeCounts,
        graduationKeys: () => METRICS,
        onStrictViolation(violations, { data: cur }) {
            console.error('[ts-ratchet] STRICT-MODE VIOLATION:');
            for (const v of violations) {
                const dirs = Object.entries(cur.byDir)
                    .filter(([, counts]) => counts[v.key] > 0)
                    .map(([d, counts]) => `${d}=${counts[v.key]}`);
                console.error(`  ${v.key}: ${v.count} (strict — must be 0). dirs: ${dirs.join(', ')}`);
            }
            console.error('');
            console.error('These metrics previously graduated to strict (count = 0) and cannot regress.');
            console.error('Fix the new occurrences. `pnpm ts:ratchet:update` will NOT silence this.');
            console.error('If a graduation was premature, edit .ts-coverage-baseline manually — and explain why in the commit.');
        },
        serialize: ({ data: cur, strict }) => JSON.stringify(pickBaselineShape(cur, strict), null, 2) + '\n',
        ratchetFailures({ data: cur, prior, strict }) {
            const curBaseline = pickBaselineShape(cur, strict);
            const failures = [];
            for (const d of Object.keys(curBaseline.byDir)) {
                if (!prior.byDir[d]) continue; // brand-new directory — handled below
                for (const m of METRICS) {
                    if (strict.has(m)) continue; // strict already checked above
                    const c = curBaseline.byDir[d][m];
                    const b = prior.byDir[d][m];
                    if (c > b) failures.push(`${d}/${m}: ${b} -> ${c} (+${c - b})`);
                }
            }
            return failures;
        },
        onRatchetFailure(failures) {
            console.error('[ts-ratchet] FAIL:');
            for (const f of failures) console.error('  ' + f);
            console.error('Either fix the new occurrences or, if intentional, run: pnpm ts:ratchet:update');
        },
        // ts-ratchet persists on a clean run only when a metric graduates — it
        // does NOT rewrite the baseline for brand-new directories (counts are
        // recorded only via --update). This matches the historical behaviour.
        persistOnCleanRun: ({ newlyStrict }) => newlyStrict.length > 0,
        onPersist({ mode, data: cur, strict, newlyStrict }) {
            const curBaseline = pickBaselineShape(cur, strict);
            if (mode === 'update') {
                console.log('[ts-ratchet] baseline updated. Totals:', curBaseline.totals);
                if (newlyStrict.length) {
                    console.log(`[ts-ratchet] GRADUATED to strict on update: ${newlyStrict.join(', ')}`);
                }
                if (strict.size) {
                    console.log(`[ts-ratchet] strict metrics: ${[...strict].sort().join(', ')}`);
                }
                return;
            }
            if (mode === 'init') {
                console.log('[ts-ratchet] baseline file missing — initialised. Totals:', curBaseline.totals);
                if (strict.size) console.log(`[ts-ratchet] strict metrics: ${[...strict].sort().join(', ')}`);
                return;
            }
            // mode === 'check' — graduation persisted on a clean run.
            if (newlyStrict.length) {
                console.log(`[ts-ratchet] GRADUATED to strict (count reached 0): ${newlyStrict.join(', ')}`);
                console.log('  .ts-coverage-baseline updated to record the graduation. Commit it alongside your changes.');
            }
        },
        report({ data: cur, prior, strict, newlyStrict }) {
            const curBaseline = pickBaselineShape(cur, strict);
            const brandNew = Object.keys(curBaseline.byDir).filter((d) => !prior.byDir[d]);

            let improved = false;
            for (const d of Object.keys(curBaseline.byDir)) {
                if (!prior.byDir[d]) continue;
                for (const m of METRICS) {
                    if (curBaseline.byDir[d][m] < prior.byDir[d][m]) improved = true;
                }
            }

            if (brandNew.length) {
                console.log(`[ts-ratchet] new directories (no prior baseline): ${brandNew.join(', ')}`);
            }
            if (improved && !newlyStrict.length) {
                console.log('[ts-ratchet] OK: counts decreased. Lower the baseline in the same commit: pnpm ts:ratchet:update');
            } else if (!newlyStrict.length) {
                console.log('[ts-ratchet] OK: per-directory counts unchanged.');
            }
            if (strict.size) {
                console.log(`[ts-ratchet] strict metrics (must remain 0): ${[...strict].sort().join(', ')}`);
            }
        },
    },
});
