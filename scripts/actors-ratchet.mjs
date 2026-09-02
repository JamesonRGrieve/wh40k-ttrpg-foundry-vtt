#!/usr/bin/env node
/**
 * Actor-completeness ratchet.
 *
 * src/packs/validate-actors.cjs is warn-only; this gates REGRESSION of its HARD
 * defect rules — dangling inventory refs (dropped content), weapons that render
 * nothing (embedded-mode with only inline weapons), un-migrated prose skills,
 * and missing stats — exactly like the other quality ratchets: a per-rule count
 * may fall, never rise, and a rule driven to 0 GRADUATES to strict (locked at 0
 * thereafter). The soft/review rules (placeholder art, weapon-absence, the
 * trait-count heuristic) are reported by the validator but not gated here, so
 * authoring a deliberately un-arted walk-on NPC is never blocked.
 *
 * Update via `pnpm actors:ratchet:update`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateActorPacks, SOFT_RULES } = require('../src/packs/validate-actors.cjs');

const BASELINE = resolve(process.cwd(), '.actors-baseline');
const updateMode = process.argv.includes('--update');

const report = validateActorPacks({ rootDir: resolve(process.cwd(), 'src/packs'), log: () => {} });

/** Hard-rule counts only (soft rules are report-only). */
const cur = {};
for (const [rule, n] of Object.entries(report.byRule)) {
    if (!SOFT_RULES.has(rule)) cur[rule] = n;
}

const loadBaseline = () => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null);
const writeBaseline = (byRule, strict) => writeFileSync(BASELINE, `${JSON.stringify({ byRule, strict: [...strict].sort() }, null, 2)}\n`, 'utf8');

const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

if (updateMode) {
    const prev = loadBaseline() ?? { byRule: {}, strict: [] };
    const strict = new Set(prev.strict ?? []);
    // A rule that was tracked before and is now absent (0) graduates to strict.
    for (const rule of Object.keys(prev.byRule ?? {})) if (!(rule in cur)) strict.add(rule);
    writeBaseline(cur, strict);
    console.log(
        `[actors-ratchet] baseline updated: ${total(cur)} hard issue(s) across ${Object.keys(cur).length} rule(s); ${strict.size} graduated to strict.`,
    );
    process.exit(0);
}

const base = loadBaseline();
if (!base) {
    writeBaseline(cur, new Set());
    console.log(`[actors-ratchet] baseline missing — initialised at ${total(cur)} hard issue(s).`);
    process.exit(0);
}

const graduated = new Set(base.strict ?? []);
const failures = [];
for (const [rule, n] of Object.entries(cur)) {
    if (graduated.has(rule)) {
        failures.push(`${rule}: graduated to 0, but ${n} reappeared`);
    } else {
        const b = base.byRule[rule] ?? 0;
        if (n > b) failures.push(`${rule}: ${b} -> ${n} (+${n - b})`);
    }
}

if (failures.length) {
    console.error('[actors-ratchet] FAIL — actor completeness regressed:');
    for (const f of failures) console.error(`  ${f}`);
    console.error('Fix the actor(s) — see `pnpm packs:validate:actors --verbose` — or, if intentional, run `pnpm actors:ratchet:update`.');
    process.exit(1);
}

const improved = Object.keys(base.byRule).some((r) => (cur[r] ?? 0) < base.byRule[r]);
console.log(
    improved
        ? '[actors-ratchet] OK: completeness improved — lower the baseline with `pnpm actors:ratchet:update`.'
        : `[actors-ratchet] OK: no regressions (${total(cur)} hard issue(s) tracked).`,
);
process.exit(0);
