/**
 * Shared import-time ApplicationV2 test stub.
 *
 * Many `src/**` and `tests/**` suites import system modules that read
 * `foundry.applications.api.ApplicationV2` / `HandlebarsApplicationMixin` at
 * module-evaluation time (via `extends foundry.applications.api.ApplicationV2`
 * or `HandlebarsApplicationMixin(Base)` mixin calls in the import chain). Under
 * happy-dom those globals don't exist, so the import throws unless a stub is
 * planted first. This module centralises the empty `ApplicationV2` class, the
 * pass-through `HandlebarsApplicationMixin`, and the single sanctioned
 * `Constructor` mixin-base type that ~8 suites used to re-declare verbatim.
 *
 * Lives under `src/module/testing/` (not `tests/lib/`) so co-located `src/**`
 * test files can import it without violating the main tsconfig's `rootDir: src`
 * — the same placement rationale as `model-import.ts`.
 *
 * Two entry points:
 *   - `buildApplicationV2Api(opts?)` returns the `{ ApplicationV2,
 *     HandlebarsApplicationMixin }` object so callers that assemble their own
 *     `foundry` blob (with `abstract`, `utils`, `handlebars`, `ux`, …) can splice
 *     it in without this module clobbering those siblings.
 *   - `installApplicationV2Stub(opts?)` merges that api object onto
 *     `globalThis.foundry.applications.api`, preserving any sibling `foundry.*`
 *     namespaces already installed, and returns the same pieces.
 *
 * Suites that also stub `DialogV2` set it on the live global per-test (the
 * `DialogV2.prompt` spy varies per case), so it is not a build-time option here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructor signatures; `unknown[]` / `never[]` are rejected by the mixin-class spec. */
// biome-ignore lint/suspicious/noExplicitAny: mixin - TS2545 requires `any[]` rest for mixin-class constructor signatures
export type Constructor<T = object> = new (...args: any[]) => T;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Empty stand-in for `foundry.applications.api.ApplicationV2`. */
export class FakeApplicationV2 {}

/** Mixin variants the consuming suites need. */
type MixinShape =
    /** `class extends Base {}` — a fresh subclass (default). */
    | 'extends-base'
    /** `(base) => base` — identity pass-through, no subclass. */
    | 'identity';

/**
 * Shape of the assembled `foundry.applications.api` stub — only the two members
 * every consumer shares. Suites that also stub `DialogV2` keep its precise type
 * in their own local view (it is set per-test, not at build time) so this base
 * shape stays assignable into those views.
 */
export interface ApplicationV2Api {
    ApplicationV2: typeof FakeApplicationV2;
    HandlebarsApplicationMixin: <T extends Constructor>(base: T) => T;
}

interface BuildApplicationV2ApiOptions {
    /** How `HandlebarsApplicationMixin` returns its result. Defaults to `'extends-base'`. */
    mixinShape?: MixinShape;
}

function makeHandlebarsApplicationMixin(shape: MixinShape): <T extends Constructor>(base: T) => T {
    if (shape === 'identity') {
        return <T extends Constructor>(base: T): T => base;
    }
    return <T extends Constructor>(base: T): T => class extends base {};
}

/**
 * Build the `foundry.applications.api` stub object without touching globals.
 * Callers that assemble their own `foundry` blob splice the result in.
 */
export function buildApplicationV2Api(opts: BuildApplicationV2ApiOptions = {}): ApplicationV2Api {
    return {
        ApplicationV2: FakeApplicationV2,
        HandlebarsApplicationMixin: makeHandlebarsApplicationMixin(opts.mixinShape ?? 'extends-base'),
    };
}

/** Typed view over `globalThis.foundry` for the merge-install path. */
interface FoundryGlobalView {
    // eslint-disable-next-line no-restricted-syntax -- boundary: shape of the Foundry `foundry` global being stubbed (applications/api namespaces are open bags)
    foundry?: { applications?: { api?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;
}

/**
 * Merge the ApplicationV2 api stub onto `globalThis.foundry.applications.api`,
 * preserving any sibling `foundry.*` / `foundry.applications.*` namespaces a
 * caller already installed. Returns the assembled api object.
 */
export function installApplicationV2Stub(opts: BuildApplicationV2ApiOptions = {}): ApplicationV2Api {
    const api = buildApplicationV2Api(opts);
    // eslint-disable-next-line no-restricted-syntax -- boundary: stubbing the Foundry `foundry` global (fvtt-types declares it non-optional) in a test harness; cast to a writable optional view so the stub can seed/merge it.
    const view = globalThis as unknown as FoundryGlobalView;
    const existingFoundry = view.foundry ?? {};
    const existingApplications = existingFoundry.applications ?? {};
    view.foundry = {
        ...existingFoundry,
        applications: {
            ...existingApplications,
            api: { ...existingApplications.api, ...api },
        },
    };
    return api;
}
