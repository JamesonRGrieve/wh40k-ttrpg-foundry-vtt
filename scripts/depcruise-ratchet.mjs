#!/usr/bin/env node
/**
 * dependency-cruiser ratchet. Runs `depcruise --output-type json …` and
 * tallies violation counts per rule name.
 *
 * Per-rule counts cannot rise. When a rule's count reaches 0 it auto-flips to
 * "strict mode": further violations of that rule are a hard fail with no
 * `--update` escape. (We also instruct dep-cruiser to fail-on-error itself
 * once the rule's severity is promoted to `error` in .dependency-cruiser.cjs;
 * for now everything is `warn`, so this ratchet is the gate.)
 *
 * Baseline file: .depcruise-baseline (JSON).
 *
 * The graduate-at-0 / strict / ratchet / persist state machine is shared with
 * the other keyed ratchets via scripts/lib/keyed-ratchet.mjs; this script keeps
 * only its depcruise-specific count acquisition + message wording.
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runKeyedRatchet } from './lib/keyed-ratchet.mjs';

const BASELINE = resolve(process.cwd(), '.depcruise-baseline');
const args = new Set(process.argv.slice(2));
const updateMode = args.has('--update');

function computeCounts() {
    let raw = '';
    try {
        raw = execSync(
            './node_modules/.bin/depcruise --config .dependency-cruiser.cjs --output-type json src/module',
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 },
        );
    } catch (err) {
        raw = err.stdout?.toString() ?? '';
    }

    let report;
    try {
        report = JSON.parse(raw);
    } catch (e) {
        console.error('[depcruise-ratchet] could not parse depcruise JSON:');
        console.error(raw.slice(0, 500));
        process.exit(2);
    }

    // Walk modules → dependencies → rules to count violations per rule name.
    const byRule = {};
    for (const mod of report.modules ?? []) {
        for (const dep of mod.dependencies ?? []) {
            for (const rule of dep.rules ?? []) {
                if (!rule?.name) continue;
                byRule[rule.name] = (byRule[rule.name] ?? 0) + 1;
            }
        }
        // module-level rule violations (e.g. no-orphans)
        for (const rule of mod.rules ?? []) {
            if (!rule?.name) continue;
            byRule[rule.name] = (byRule[rule.name] ?? 0) + 1;
        }
    }
    return { counts: byRule };
}

runKeyedRatchet({
    baselinePath: BASELINE,
    label: 'depcruise-ratchet',
    updateMode,
    shape: {
        computeCounts,
        graduationKeys: ({ counts, prior }) => {
            const priorByRule = prior?.byRule ?? {};
            return new Set([...Object.keys(counts), ...Object.keys(priorByRule)]);
        },
        onStrictViolation(violations) {
            console.error('[depcruise-ratchet] STRICT-MODE VIOLATION:');
            for (const v of violations) console.error(`  ${v.key}: ${v.count} (strict — must be 0)`);
            console.error('');
            console.error('These dep-cruiser rules previously graduated to strict (count = 0) and cannot regress.');
            console.error('Run `pnpm deps:check` to see the offenders. `--update` will NOT silence this.');
        },
        serialize({ counts, strict }) {
            const out = {
                strict: [...strict].sort(),
                totals: { totalViolations: Object.values(counts).reduce((a, b) => a + b, 0) },
                byRule: Object.fromEntries(Object.keys(counts).sort().map((r) => [r, counts[r]])),
            };
            return JSON.stringify(out, null, 2) + '\n';
        },
        ratchetFailures({ counts, prior, strict }) {
            const priorByRule = prior?.byRule ?? {};
            const failures = [];
            for (const rule of Object.keys(counts)) {
                if (strict.has(rule)) continue;
                const c = counts[rule];
                const b = priorByRule[rule] ?? null;
                if (b === null) continue;
                if (c > b) failures.push(`${rule}: ${b} -> ${c} (+${c - b})`);
            }
            return failures;
        },
        onRatchetFailure(failures) {
            console.error('[depcruise-ratchet] FAIL:');
            for (const f of failures) console.error('  ' + f);
            console.error('Run `pnpm deps:check` to see what changed.');
            console.error('Either fix the new violations or, if intentional, run: pnpm deps:ratchet:update');
        },
        persistOnCleanRun: ({ counts, prior, newlyStrict }) => {
            const priorByRule = prior?.byRule ?? {};
            const brandNew = Object.keys(counts).filter((r) => !(r in priorByRule));
            return newlyStrict.length > 0 || brandNew.length > 0;
        },
        onPersist({ mode, counts, strict, newlyStrict, prior }) {
            const totalViolations = Object.values(counts).reduce((a, b) => a + b, 0);
            if (mode === 'update') {
                console.log('[depcruise-ratchet] baseline updated. Total violations:', totalViolations);
                if (newlyStrict.length) console.log(`[depcruise-ratchet] GRADUATED to strict on update: ${newlyStrict.join(', ')}`);
                if (strict.size) console.log(`[depcruise-ratchet] strict rules: ${[...strict].sort().join(', ')}`);
                return;
            }
            if (mode === 'init') {
                console.log('[depcruise-ratchet] baseline file missing — initialised. Total violations:', totalViolations);
                if (strict.size) console.log(`[depcruise-ratchet] strict rules: ${[...strict].sort().join(', ')}`);
                return;
            }
            // mode === 'check' — graduation and/or brand-new rules persisted on a clean run.
            const priorByRule = prior?.byRule ?? {};
            const brandNew = Object.keys(counts).filter((r) => !(r in priorByRule));
            if (newlyStrict.length) {
                console.log(`[depcruise-ratchet] GRADUATED to strict (count reached 0): ${newlyStrict.join(', ')}`);
                console.log('  .depcruise-baseline updated. Commit it alongside your changes.');
            }
            if (brandNew.length) {
                console.log(`[depcruise-ratchet] new rules (no prior baseline): ${brandNew.join(', ')}`);
            }
        },
        report({ counts, prior, strict, newlyStrict }) {
            const priorByRule = prior?.byRule ?? {};
            const brandNew = Object.keys(counts).filter((r) => !(r in priorByRule));
            let improved = false;
            for (const rule of Object.keys(counts)) {
                if (rule in priorByRule && counts[rule] < priorByRule[rule]) improved = true;
            }
            if (improved && !newlyStrict.length) {
                console.log('[depcruise-ratchet] OK: counts decreased. Lower the baseline in the same commit: pnpm deps:ratchet:update');
            } else if (!newlyStrict.length && !brandNew.length) {
                console.log('[depcruise-ratchet] OK: per-rule counts unchanged.');
            }
            if (strict.size) console.log(`[depcruise-ratchet] strict rules (must remain 0): ${[...strict].sort().join(', ')}`);
        },
    },
});
