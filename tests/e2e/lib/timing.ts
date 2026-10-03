/**
 * Single source of every Tier B time budget.
 *
 * The suite runs on a shared, heavily loaded box, where a fixed budget that is
 * generous on an idle machine times out for no reason of the system's own. Every
 * budget — Playwright's test/expect/web-server timeouts, per-test
 * `test.setTimeout`, the dialog opener, and the in-page `withTimeout` / `waitFor`
 * helpers (see in-page-helpers.ts) — is derived from a base value through
 * {@link scaledMs}, so `E2E_TIMEOUT_SCALE=3` gives the whole suite 3× headroom.
 * At the default scale of 1 every budget equals its base value.
 */

/** Scale used when `E2E_TIMEOUT_SCALE` is unset or not a positive finite number. */
const DEFAULT_TIMEOUT_SCALE = 1;

function readTimeoutScale(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === '') return DEFAULT_TIMEOUT_SCALE;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_SCALE;
}

/** Multiplier applied to every e2e time budget, read once from `E2E_TIMEOUT_SCALE`. */
export const E2E_TIMEOUT_SCALE = readTimeoutScale(process.env['E2E_TIMEOUT_SCALE']);

/**
 * Scale a base time budget (ms) by {@link E2E_TIMEOUT_SCALE}.
 * @param {number} baseMs  The budget at scale 1.
 * @returns {number} The scaled budget, rounded to a whole millisecond.
 */
export function scaledMs(baseMs: number): number {
    return Math.round(baseMs * E2E_TIMEOUT_SCALE);
}

/** Base budget for one in-page operation (document create, sheet render, …). */
const OP_TIMEOUT_BASE_MS = 5_000;

/** Default budget for one in-page operation, scaled. */
export const E2E_OP_TIMEOUT_MS = scaledMs(OP_TIMEOUT_BASE_MS);
