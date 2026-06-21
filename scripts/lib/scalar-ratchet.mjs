// Shared scalar-baseline ratchet runner.
//
// The integer-baseline ratchets (animation, important, theme, integration) all
// share the same skeleton: read a single-number baseline file, NaN-check it,
// compare against a freshly-computed `current` count in a fixed direction, and
// emit a fail/improve message with the right exit code — or, in update mode,
// rewrite the baseline to `current`. Only the SCAN that produces `current`, the
// baseline filename, the direction, and the exact message strings differ; this
// runner owns everything else so each ratchet script is just "scan → delegate".
//
// `biome`/`css` ratchets are intentionally NOT routed through this: they are
// keyed/per-rule ratchets, not integer-scalar, and the keyed `runKeyedRatchet`
// already excludes them.
//
// Plain Node ESM; `process.exit(...)` codes are load-bearing (these gate
// pre-commit), so they are reproduced exactly:
//   - exit 2: missing baseline (check mode) or non-numeric baseline.
//   - exit 1: ratchet regression (rise when direction='rise', fall when 'fall').
//   - exit 0: pass, improvement, or update/seed.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Run the scalar-baseline comparison/update against `current`.
 *
 * @param {object} opts
 * @param {string} opts.baselinePath path to the single-number baseline file.
 * @param {number} opts.current freshly-computed count for this run.
 * @param {'rise'|'fall'} opts.direction which way is a regression — `'rise'`
 *   fails when `current > baseline` (must-not-rise), `'fall'` fails when
 *   `current < baseline` (must-not-fall).
 * @param {boolean} [opts.updateMode] when true, rewrite the baseline to
 *   `current` and exit 0 (used by the `*-ratchet-update` scripts and by the
 *   integration ratchet's `--update` / seed-if-missing path).
 * @param {string} [opts.seedHint] message printed (then exit 2) when the
 *   baseline file is missing in check mode.
 * @param {(current: number, baseline: number) => string} [opts.failMessage]
 *   message printed (then exit 1) on a regression.
 * @param {(current: number, baseline: number) => string} [opts.improveMessage]
 *   message printed (exit 0) when the count moved favourably.
 * @param {(current: number) => string} [opts.updateMessage] message printed in
 *   update mode after rewriting the baseline.
 * @returns {never} always terminates via `process.exit`.
 */
export function runScalarRatchet({
    baselinePath,
    current,
    direction,
    updateMode = false,
    seedHint,
    failMessage,
    improveMessage,
    updateMessage,
}) {
    if (updateMode) {
        writeFileSync(baselinePath, `${current}\n`);
        if (updateMessage) console.log(updateMessage(current));
        process.exit(0);
    }

    if (!existsSync(baselinePath)) {
        if (seedHint !== undefined) console.error(seedHint);
        process.exit(2);
    }

    const baseline = Number(readFileSync(baselinePath, 'utf8').trim());
    if (Number.isNaN(baseline)) {
        console.error(`${baselinePath} is not a number.`);
        process.exit(2);
    }

    const regressed = direction === 'rise' ? current > baseline : current < baseline;
    const improved = direction === 'rise' ? current < baseline : current > baseline;

    if (regressed) {
        if (failMessage) console.error(failMessage(current, baseline));
        process.exit(1);
    }

    if (improved && improveMessage) {
        console.log(improveMessage(current, baseline));
    }

    process.exit(0);
}
