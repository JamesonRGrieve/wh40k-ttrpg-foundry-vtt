#!/usr/bin/env node
/**
 * Run the repo's `tsc` with the shared heap (scripts/lib/tsc-heap.cjs), passing
 * every argument through. Used by `pnpm typecheck` / `pnpm typecheck:tests` so
 * they cannot run out of memory on a CI runner. A crash (killed by a signal) is
 * reported as a failure, never as a clean exit.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tscEnv } = require('./lib/tsc-heap.cjs');

const result = spawnSync('./node_modules/.bin/tsc', process.argv.slice(2), { stdio: 'inherit', env: tscEnv() });
if (result.error) {
    console.error(`[tsc] could not start tsc: ${result.error.message}`);
    process.exit(1);
}
if (result.signal !== null) {
    console.error(`[tsc] tsc was killed by ${result.signal}`);
    process.exit(1);
}
process.exit(result.status ?? 1);
