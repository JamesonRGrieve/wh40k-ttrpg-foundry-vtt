#!/usr/bin/env node
// Ratchet for Tier A integration tests. Direction: case count cannot FALL.
// A drop means an integration test was deleted or its `it(...)` cases were
// removed without replacement. Update via `pnpm integration:ratchet:update`
// after deliberately adding cases.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runScalarRatchet } from './lib/scalar-ratchet.mjs';

const COVERAGE = '.integration-coverage.json';
const BASELINE = '.integration-baseline';
const UPDATE = process.argv.includes('--update');

const regen = spawnSync(process.execPath, ['scripts/integration-coverage.mjs'], { stdio: 'inherit' });
if (regen.status !== 0) process.exit(regen.status ?? 1);

const report = JSON.parse(readFileSync(COVERAGE, 'utf8'));
const current = Number(report.cases ?? 0);

runScalarRatchet({
    baselinePath: BASELINE,
    current,
    direction: 'fall',
    updateMode: UPDATE || !existsSync(BASELINE),
    updateMessage: (cur) => `integration:ratchet — baseline ${UPDATE ? 'updated' : 'seeded'} to ${cur}`,
    failMessage: (cur, baseline) =>
        `integration:ratchet failed — ${cur} integration cases, baseline ${baseline}. ` +
        'An integration test was removed. Restore it, or run `pnpm integration:ratchet:update` if the deletion is intentional.',
    improveMessage: (cur, baseline) =>
        `integration:ratchet — ${cur} integration cases (was ${baseline}). Run \`pnpm integration:ratchet:update\` to lock the gain.`,
});
