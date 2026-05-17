#!/usr/bin/env node
// Ratchet for Tier A integration tests. Direction: case count cannot FALL.
// A drop means an integration test was deleted or its `it(...)` cases were
// removed without replacement. Update via `pnpm integration:ratchet:update`
// after deliberately adding cases.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const COVERAGE = '.integration-coverage.json';
const BASELINE = '.integration-baseline';
const UPDATE = process.argv.includes('--update');

const regen = spawnSync(process.execPath, ['scripts/integration-coverage.mjs'], { stdio: 'inherit' });
if (regen.status !== 0) process.exit(regen.status ?? 1);

const report = JSON.parse(readFileSync(COVERAGE, 'utf8'));
const current = Number(report.cases ?? 0);

if (UPDATE || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, `${current}\n`);
    console.log(`integration:ratchet — baseline ${UPDATE ? 'updated' : 'seeded'} to ${current}`);
    process.exit(0);
}

const baseline = Number(readFileSync(BASELINE, 'utf8').trim());
if (Number.isNaN(baseline)) {
    console.error(`${BASELINE} is not a number.`);
    process.exit(2);
}

if (current < baseline) {
    console.error(
        `integration:ratchet failed — ${current} integration cases, baseline ${baseline}. ` +
            'An integration test was removed. Restore it, or run `pnpm integration:ratchet:update` if the deletion is intentional.',
    );
    process.exit(1);
}

if (current > baseline) {
    console.log(
        `integration:ratchet — ${current} integration cases (was ${baseline}). Run \`pnpm integration:ratchet:update\` to lock the gain.`,
    );
}
process.exit(0);
