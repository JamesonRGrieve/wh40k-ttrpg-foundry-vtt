// Shared "auto-flip" keyed-ratchet state machine.
//
// Five ratchets (ts, strict, knip, depcruise, lint) all implement the same
// one-way valve:
//
//   load baseline → graduate-any-key-at-0 → hard-fail any strict key > 0 →
//   ratchet non-strict keys (no rise) → persist on update / init / graduation.
//
// The copies had drifted (e.g. ts-ratchet did not persist brand-new keys while
// strict/knip/depcruise did). This module owns the state machine; each caller
// supplies only the variable pieces through a `shape`, so the semantics — the
// baseline file format, the messages, the exit codes, the graduation behaviour
// — stay byte-identical to the pre-extraction scripts.
//
// Presentation (the FAIL / STRICT-MODE / OK message text) is intentionally
// shape-controlled, because the historical wording differs per ratchet (e.g.
// ts-ratchet appends `dirs: …`, lint says `must stay 0`). The runner owns only
// the control flow, graduation set, and persistence decisions — the parts that
// had actually drifted between copies.
//
// The runner is a thin sequencer of callbacks rather than a data-shape-aware
// helper: the scalar no-strict ratchets (biome/animation/important/theme)
// deliberately do NOT use it.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * @typedef {Object} KeyedRatchetCtx
 * @property {string} label
 * @property {Record<string, number>} counts   per-key counts driving graduation
 * @property {unknown} data                     opaque payload from computeCounts
 * @property {boolean} baseExists
 * @property {any} prior                         parsed prior baseline (or null)
 * @property {Set<string>} priorStrict
 * @property {Set<string>} strict                prior strict ∪ newly graduated
 * @property {string[]} newlyStrict
 */

/**
 * @typedef {Object} KeyedRatchetShape
 * @property {() => { counts: Record<string, number>, data?: unknown }} computeCounts
 *   Acquire the raw per-key counts. `counts` drives graduation / strict checks;
 *   `data` carries any extra state the other callbacks need.
 * @property {(ctx: KeyedRatchetCtx) => Iterable<string>} [graduationKeys]
 *   Keys eligible to graduate this run. Default: current keys ∪ prior-strict.
 * @property {(key: string, ctx: KeyedRatchetCtx) => number} [strictCountOf]
 *   Count that must be 0 for a strict key. Default: `counts[key] ?? 0`.
 * @property {(violations: {key:string,count:number}[], ctx: KeyedRatchetCtx) => void} onStrictViolation
 *   Emit the strict-mode-violation message block (runner then exits 1).
 * @property {(ctx: KeyedRatchetCtx) => string} serialize
 *   Exact baseline-file text (including trailing newline).
 * @property {(ctx: KeyedRatchetCtx) => string[]} ratchetFailures
 *   Non-strict rise check: failure lines (empty ⇒ pass).
 * @property {(failures: string[], ctx: KeyedRatchetCtx) => void} onRatchetFailure
 *   Emit the FAIL message block (runner then exits 1).
 * @property {(baselinePath: string) => { baseExists: boolean, prior: any, priorStrict: Set<string> }} [loadPrior]
 *   Override baseline loading (e.g. lint's legacy bare-integer migration).
 * @property {(ctx: KeyedRatchetCtx) => void} [extraGuard]
 *   Extra hard-fail stage run right after the strict-violation check, before
 *   the update/init/ratchet branches (e.g. lint's "no ESLint errors allowed").
 *   It must `process.exit` itself on failure.
 * @property {(ctx: KeyedRatchetCtx) => boolean} [persistOnCleanRun]
 *   Whether to (re)write the baseline on a clean run. Default: any graduation.
 * @property {(ctx: KeyedRatchetCtx & { mode: 'update'|'init'|'check' }) => void} [onPersist]
 *   Side effects + logging after a baseline write.
 * @property {(ctx: KeyedRatchetCtx) => void} [report]
 *   Trailing OK/summary lines on a clean (non-persisting) terminal state.
 */

function loadPrior(baselinePath) {
    const baseExists = existsSync(baselinePath);
    const prior = baseExists ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
    const priorStrict = new Set(Array.isArray(prior?.strict) ? prior.strict : []);
    return { baseExists, prior, priorStrict };
}

/**
 * Run the shared auto-flip ratchet state machine.
 *
 * @param {{ baselinePath: string, label: string, updateMode?: boolean, shape: KeyedRatchetShape }} options
 * @returns {never} always exits the process.
 */
export function runKeyedRatchet({ baselinePath, label, updateMode = false, shape }) {
    const { counts, data } = shape.computeCounts();
    const { baseExists, prior, priorStrict } = (shape.loadPrior ?? loadPrior)(baselinePath);

    const ctx = {
        label,
        counts,
        data,
        baseExists,
        prior,
        priorStrict,
        strict: new Set(priorStrict),
        newlyStrict: [],
    };

    const strictCountOf = shape.strictCountOf ?? ((key) => counts[key] ?? 0);

    // --- Auto-flip: any eligible key whose current count is 0 graduates. ---
    const graduationKeys = shape.graduationKeys
        ? shape.graduationKeys(ctx)
        : new Set([...Object.keys(counts), ...priorStrict]);
    for (const key of graduationKeys) {
        if (ctx.strict.has(key)) continue;
        if (strictCountOf(key, ctx) === 0) {
            ctx.strict.add(key);
            ctx.newlyStrict.push(key);
        }
    }

    // --- Hard-fail: a strict key with count > 0 is a non-negotiable regression. ---
    const strictViolations = [];
    for (const key of [...ctx.strict].sort()) {
        const count = strictCountOf(key, ctx);
        if (count > 0) strictViolations.push({ key, count });
    }
    if (strictViolations.length) {
        shape.onStrictViolation(strictViolations, ctx);
        process.exit(1);
    }

    // --- Extra hard-fail stage (e.g. lint: ESLint errors are never allowed). ---
    shape.extraGuard?.(ctx);

    const writeBaseline = () => writeFileSync(baselinePath, shape.serialize(ctx), 'utf8');

    // --- --update: force-write the baseline (records graduations too). ---
    if (updateMode) {
        writeBaseline();
        shape.onPersist?.({ ...ctx, mode: 'update' });
        process.exit(0);
    }

    // --- First run: seed the baseline. ---
    if (!baseExists) {
        writeBaseline();
        shape.onPersist?.({ ...ctx, mode: 'init' });
        process.exit(0);
    }

    // --- Ratchet: non-strict keys may not rise. ---
    const failures = shape.ratchetFailures(ctx);
    if (failures.length) {
        shape.onRatchetFailure(failures, ctx);
        process.exit(1);
    }

    // --- Persist graduations / brand-new keys / side effects on a clean run. ---
    const persistClean = shape.persistOnCleanRun
        ? shape.persistOnCleanRun(ctx)
        : ctx.newlyStrict.length > 0;
    if (persistClean) {
        writeBaseline();
        shape.onPersist?.({ ...ctx, mode: 'check' });
    }

    shape.report?.(ctx);
    process.exit(0);
}
