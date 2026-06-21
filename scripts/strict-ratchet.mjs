#!/usr/bin/env node
/**
 * Per-TS-code ratchet over a tsc run. Defaults to tsconfig.strict.json (the
 * "next-tier" strictness flags) — also reusable for tsconfig.test.json (test
 * and story compilation) via `--config` and `--baseline`.
 *
 * Two enforcement modes per TS error code:
 *
 *   1. RATCHET (default) — per-code error counts may only DECREASE. Brand-new
 *      codes appearing for the first time are added at their current count
 *      (no fail).
 *
 *   2. STRICT — once a code's count reaches 0 it auto-graduates. The baseline
 *      records the code in `"strict": [...]` and any future occurrence is a
 *      hard fail with no `--update` escape hatch.
 *
 * Usage:
 *   node scripts/strict-ratchet.mjs                                                                     # default: tsconfig.strict.json + .strict-coverage-baseline
 *   node scripts/strict-ratchet.mjs --update
 *   node scripts/strict-ratchet.mjs --config tsconfig.test.json --baseline .test-typecheck-baseline --report .test-typecheck-coverage.json
 *
 * Approximate flag → TS code mapping for the default strict tsconfig:
 *   noImplicitOverride                    → TS4114
 *   noFallthroughCasesInSwitch            → TS7029
 *   forceConsistentCasingInFileNames      → TS1149
 *   noImplicitReturns                     → TS7030
 *   noUncheckedIndexedAccess              → TS18048, TS2532, TS2538, TS2722
 *   noPropertyAccessFromIndexSignature    → TS4111
 *   exactOptionalPropertyTypes            → TS2375, TS2379, TS2412
 *
 * The graduate-at-0 / strict / ratchet / persist state machine is shared with
 * the other keyed ratchets via scripts/lib/keyed-ratchet.mjs; this script keeps
 * only its tsc count acquisition + message wording.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runKeyedRatchet } from './lib/keyed-ratchet.mjs';

const argv = process.argv.slice(2);
function arg(name, fallback) {
    const i = argv.indexOf(name);
    if (i === -1) return fallback;
    return argv[i + 1];
}

const config = arg('--config', 'tsconfig.strict.json');
const baseline = arg('--baseline', '.strict-coverage-baseline');
const reportPath = arg('--report', '.strict-coverage.json');
const label = arg('--label', 'strict-ratchet');
const updateMode = argv.includes('--update');

const REPORT = resolve(process.cwd(), reportPath);
const BASELINE = resolve(process.cwd(), baseline);

function computeCounts() {
    execSync(`node scripts/strict-coverage.mjs --config ${config} --out ${reportPath} --quiet`, { stdio: 'inherit' });

    if (!existsSync(REPORT)) {
        console.error(`[${label}] missing ${REPORT} — strict-coverage did not produce a report.`);
        process.exit(2);
    }

    const cur = JSON.parse(readFileSync(REPORT, 'utf8'));
    return { counts: cur.byCode ?? {}, data: cur };
}

runKeyedRatchet({
    baselinePath: BASELINE,
    label,
    updateMode,
    shape: {
        computeCounts,
        graduationKeys: ({ counts, prior }) => {
            const priorByCode = prior?.byCode ?? {};
            return new Set([...Object.keys(counts), ...Object.keys(priorByCode)]);
        },
        onStrictViolation(violations) {
            console.error(`[${label}] STRICT-MODE VIOLATION:`);
            for (const v of violations) console.error(`  ${v.key}: ${v.count} (strict — must be 0)`);
            console.error('');
            console.error('These TS error codes previously graduated to strict (count = 0) and cannot regress.');
            console.error(`Fix the new occurrences. \`--update\` will NOT silence this.`);
            console.error(`If a graduation was premature, edit ${baseline} manually.`);
        },
        serialize({ data: cur, strict }) {
            const out = {
                strict: [...strict].sort(),
                config: cur.config ?? config,
                totals: { totalErrors: cur.summary.totalErrors },
                byCode: {},
            };
            for (const code of Object.keys(cur.byCode).sort()) out.byCode[code] = cur.byCode[code];
            return JSON.stringify(out, null, 2) + '\n';
        },
        ratchetFailures({ counts, prior, strict }) {
            const priorByCode = prior?.byCode ?? {};
            const failures = [];
            for (const code of Object.keys(counts)) {
                if (strict.has(code)) continue;
                const c = counts[code];
                const b = priorByCode[code] ?? null;
                if (b === null) continue;
                if (c > b) failures.push(`${code}: ${b} -> ${c} (+${c - b})`);
            }
            return failures;
        },
        onRatchetFailure(failures) {
            console.error(`[${label}] FAIL:`);
            for (const f of failures) console.error('  ' + f);
            console.error(`Either fix the new occurrences or, if intentional, run with --update.`);
        },
        persistOnCleanRun: ({ counts, prior, newlyStrict }) => {
            const priorByCode = prior?.byCode ?? {};
            const brandNew = Object.keys(counts).filter((c) => !(c in priorByCode));
            return newlyStrict.length > 0 || brandNew.length > 0;
        },
        onPersist({ mode, data: cur, strict, newlyStrict, prior }) {
            if (mode === 'update') {
                console.log(`[${label}] baseline updated. Total errors:`, cur.summary.totalErrors);
                if (newlyStrict.length) console.log(`[${label}] GRADUATED to strict on update: ${newlyStrict.join(', ')}`);
                if (strict.size) console.log(`[${label}] strict codes: ${[...strict].sort().join(', ')}`);
                return;
            }
            if (mode === 'init') {
                console.log(`[${label}] baseline file missing — initialised. Total errors:`, cur.summary.totalErrors);
                if (strict.size) console.log(`[${label}] strict codes: ${[...strict].sort().join(', ')}`);
                return;
            }
            // mode === 'check' — graduation and/or brand-new codes persisted on a clean run.
            const priorByCode = prior?.byCode ?? {};
            const curByCode = cur.byCode ?? {};
            const brandNew = Object.keys(curByCode).filter((c) => !(c in priorByCode));
            if (newlyStrict.length) {
                console.log(`[${label}] GRADUATED to strict (count reached 0): ${newlyStrict.join(', ')}`);
                console.log(`  ${baseline} updated. Commit it alongside your changes.`);
            }
            if (brandNew.length) {
                console.log(`[${label}] new TS codes (no prior baseline): ${brandNew.join(', ')}`);
                console.log('  Recorded at current counts. They ratchet downward from here.');
            }
        },
        report({ data: cur, prior, strict, newlyStrict }) {
            const priorByCode = prior?.byCode ?? {};
            const curByCode = cur.byCode ?? {};
            const brandNew = Object.keys(curByCode).filter((c) => !(c in priorByCode));
            let improved = false;
            for (const code of Object.keys(curByCode)) {
                if (code in priorByCode && curByCode[code] < priorByCode[code]) improved = true;
            }
            if (improved && !newlyStrict.length) {
                console.log(`[${label}] OK: counts decreased. Lower the baseline in the same commit (--update).`);
            } else if (!newlyStrict.length && !brandNew.length) {
                console.log(`[${label}] OK: per-code counts unchanged.`);
            }
            if (strict.size) console.log(`[${label}] strict codes (must remain 0): ${[...strict].sort().join(', ')}`);
        },
    },
});
