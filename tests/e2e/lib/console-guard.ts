/**
 * Global browser-error guard shared by every Tier B spec (installed once in the
 * extended `page` fixture, tests/e2e/lib/test.ts). It fails a test on any
 * uncaught `pageerror` OR any `console.error` that is NOT known-benign framework
 * noise — so an error a component logs (or throws) is caught even in specs that
 * never wrote their own listener, and without 138 copies of the same boilerplate.
 *
 * `IGNORED_PATTERNS` is the allowlist. Two categories only:
 *  1. FRAMEWORK / HEADLESS noise — messages Foundry itself or the software-WebGL
 *     test browser emit, never wh40k-rpg code. Calibrated with
 *     `E2E_CONSOLE_GUARD=report` against a representative spec sample.
 *  2. BASELINED pre-existing defects — a real wh40k-rpg error the guard surfaced
 *     that predates it, tagged with a tracking note so the guard ships green and
 *     catches NEW regressions while the known issue is fixed separately. Every
 *     such entry MUST cite the defect; removing the entry is part of its fix.
 *
 * Keep it TIGHT — a too-broad pattern silently hides real defects. Add a pattern
 * only after confirming (via report mode) the exact message and its source.
 */
const IGNORED_PATTERNS: readonly RegExp[] = [
    // ── Framework / headless noise ──────────────────────────────────────────
    // Foundry 404s on assets (fonts, textures, sounds) the ephemeral test world
    // does not ship. By far the most common console error.
    /Failed to load resource: the server responded with a status of 404/i,
    /net::ERR_/i,
    // Foundry's setup / package-browser client script runs with no package list
    // in the headless test world and touches a null element during world join —
    // fires OUTSIDE any spec's own listener (during navigation), which is exactly
    // the gap the global guard closes.
    /No packages detected/i,
    /Cannot set properties of null \(setting 'hidden'\)/i,
    // Software-WebGL / canvas in the GPU-less test browser (PIXI probing GL
    // extensions on a context that isn't fully backed).
    /Cannot read properties of (?:undefined|null) \(reading 'getExtension'\)/i,
    /WebGL|Failed to create WebGL context|Automatic fallback to software WebGL/i,
    // Foundry V14 deprecation shims occasionally log at error level.
    /\bis deprecated\b/i,
    // Foundry client-side document validation for compendium sources predating a
    // schema tightening — the system's own migration surface, covered by the
    // migration specs; not a runtime defect in the code under test.
    /\bvalidation errors\b/i,

    // (No baselined defects. The formula-evaluator V14 sync-die throw that lived
    // here was fixed — see src/module/utils/formula-evaluator.ts DieRoller seam.)
];

/** Whether a captured error message is known-benign framework noise or a baselined defect. */
function isIgnoredError(text: string): boolean {
    return IGNORED_PATTERNS.some((re) => re.test(text));
}

/** A captured browser error, tagged by source for a readable failure message. */
export interface CapturedError {
    kind: 'pageerror' | 'console.error';
    text: string;
}

/** Filter a batch of captured errors down to the unexpected (non-allowlisted) ones. */
export function unexpectedErrors(errors: readonly CapturedError[]): CapturedError[] {
    return errors.filter((e) => !isIgnoredError(e.text));
}
