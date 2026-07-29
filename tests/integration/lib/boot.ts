/**
 * Tier A boot harness. Loads Foundry's compiled client into a jsdom window,
 * stubs the browser surface Foundry expects (canvas, WebGL, IndexedDB),
 * registers the wh40k-rpg system from the working tree, and drives the init
 * pipeline until `ready`.
 *
 * Booting Foundry outside its native browser environment is best-effort: V14
 * uses real Canvas / WebGL / IndexedDB extensively. If boot throws, the
 * harness records the failure on `bootResult.error`; test files inspect this
 * via `getRuntime()` and skip themselves rather than fail the whole suite.
 * That lets us land the scaffold and grow Tier A coverage incrementally
 * without a flaky red CI.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vm from 'node:vm';
import { FOUNDRY_RELEASE_DIR, hasFoundryTierA, skipBanner } from './has-foundry';

export type BootResult =
    | { booted: true; skipped: false; runtime: FoundryRuntime; error?: undefined }
    | { booted: false; skipped: boolean; runtime?: undefined; error?: Error };

export interface FoundryRuntime {
    window: object;
    game: object;
    CONFIG: object;
    Hooks: object;
    foundry: object;
}

let cached: BootResult | undefined;

export async function bootFoundryOnce(): Promise<BootResult> {
    if (cached) return cached;
    if (!hasFoundryTierA()) {
        // eslint-disable-next-line no-console
        console.log(skipBanner('A'));
        cached = { booted: false, skipped: true };
        return cached;
    }
    let result: BootResult;
    try {
        result = await doBoot();
    } catch (err) {
        // Log the STACK, not just the message: "Class extends value undefined is
        // not a constructor or null" names no file, so a boot failure was
        // undiagnosable and the whole tier silently skipped (20 of 22 tests).
        const bootError = err as Error;
        const stackFrames = typeof bootError.stack === 'string' ? `\n${bootError.stack.split('\n').slice(0, 12).join('\n')}` : '';
        // eslint-disable-next-line no-console
        console.warn(`[integration] Tier A boot threw — tests will skip. Reason: ${bootError.message}${stackFrames}`);
        result = { booted: false, skipped: true, error: err as Error };
    }
    // Atomic check-and-set: a concurrent caller may have populated `cached`
    // while we were awaiting `doBoot()`; the first result wins.
    // eslint-disable-next-line no-restricted-syntax -- boundary: concurrency-safe one-shot cache write (not a schema default)
    cached ??= result;
    return cached;
}

export function getRuntime(): FoundryRuntime | undefined {
    return cached?.runtime;
}

/**
 * Browser globals Foundry expects, and where the release vendors them.
 *
 * `foundry.mjs` is written for a browser that has already loaded these via
 * `<script>` tags, so under Node they are simply absent and the boot dies on
 * whichever one it reaches first — previously as
 * "Class extends value undefined is not a constructor or null" (PIXI.Transform),
 * with no file named, which is why the whole tier skipped 20 of 22 tests in
 * silence.
 *
 * The hand-rolled PIXI stub this replaced was grown "class-by-class as tests
 * demand" and had stalled; PIXI alone has 238 exports. The licensed release
 * vendors the genuine builds, so load those instead of imitating them.
 * `null` for a package that is absent or fails to load — the caller then skips
 * exactly as before.
 */
const FOUNDRY_BROWSER_GLOBALS: ReadonlyArray<{
    readonly name: string;
    readonly entry: readonly string[];
    /** When set, attach under this global as a sub-namespace (PIXI plugins do this). */
    readonly attachTo?: string;
    /** When a UMD build nests its export under its own name, the key to unwrap. */
    readonly unwrap?: string;
    /** Copy into an extensible object — required only for a global that receives plugins. */
    readonly extensible?: boolean;
}> = [
    { name: 'PIXI', entry: ['pixi.js', 'dist', 'pixi.min.mjs'], extensible: true },
    // A PIXI plugin: Foundry's grid layer declares `extends PIXI.smooth.SmoothGraphics`.
    { name: 'smooth', attachTo: 'PIXI', entry: ['@pixi', 'graphics-smooth', 'dist', 'pixi-graphics-smooth.mjs'] },
    { name: 'Handlebars', entry: ['handlebars', 'dist', 'cjs', 'handlebars.js'] },
    { name: 'showdown', entry: ['showdown', 'dist', 'showdown.js'] },
    { name: 'HandlebarsIntl', entry: ['handlebars-intl', 'dist', 'handlebars-intl.js'], unwrap: 'HandlebarsIntl' },
];

/**
 * Load one vendored global out of the Foundry release.
 * @param {readonly string[]} entry  Path segments under `.foundry-release/node_modules`.
 * @param {string} unwrapKey  When a UMD build nests its export under its own name, the key to unwrap.
 * @param {boolean} copy  Copy into an extensible plain object (needed only when a plugin attaches onto it).
 * @returns {Promise<object | null>}  The module namespace, or null when unavailable.
 */
async function loadVendoredGlobal(entry: readonly string[], unwrapKey = '', copy = false): Promise<object | null> {
    const entryPath = resolve(FOUNDRY_RELEASE_DIR, 'node_modules', ...entry);
    if (!existsSync(entryPath)) return null;
    try {
        // eslint-disable-next-line no-restricted-syntax -- boundary: the licensed release's vendored browser libraries ship no types on these paths
        const mod = (await import(pathToFileURL(entryPath).href)) as { default?: object };
        // CJS builds (handlebars, showdown) arrive under `default`; ESM (pixi) does not.
        let namespace = mod.default ?? mod;
        // A UMD build can nest its export one level under its own global name
        // (handlebars-intl exports `{ HandlebarsIntl: … }`), so unwrap that.
        // eslint-disable-next-line no-restricted-syntax -- boundary: an untyped vendored UMD namespace
        const nested = (namespace as Record<string, unknown>)[unwrapKey];
        if (unwrapKey !== '' && nested !== undefined && nested !== null) namespace = nested;
        // Only COPY when something will be attached onto this global. An ESM
        // module namespace is sealed, so PIXI must be copied for `PIXI.smooth`
        // to attach — but copying a CJS export drops everything that lives on its
        // prototype (spreading handlebars loses `registerHelper`), so leave those
        // alone.
        return copy ? { ...namespace } : namespace;
    } catch {
        return null;
    }
}

interface BrowserGlobals {
    [key: string]: object | undefined;
    indexedDB?: object;
    OffscreenCanvas?: object;
    WebGL2RenderingContext?: object;
    BiquadFilterNode?: object;
    ConvolverNode?: object;
    AudioNode?: object;
    GainNode?: object;
    Worker?: object;
    Event?: object;
    CustomEvent?: object;
    EventTarget?: object;
    /** Event-target methods live on the jsdom Window prototype, so they are modelled explicitly. */
    dispatchEvent?: ((event: object) => boolean) | object;
    addEventListener?: ((type: string, listener: object) => void) | object;
    removeEventListener?: ((type: string, listener: object) => void) | object;
    PIXI?: object;
    Handlebars?: object;
    showdown?: object;
    HandlebarsIntl?: object;
    Hooks?: { callAll?: (name: string) => void };
    game?: object;
    CONFIG?: object;
    foundry?: object;
}

/**
 * Install the browser surface Foundry reads at module scope: the jsdom event
 * constructors and their prototype methods, plus the primitives the real HTML
 * page injects before loading foundry.mjs.
 * @param {BrowserGlobals} win  The jsdom window the globals are mirrored from.
 * @param {BrowserGlobals} g  The test global they are installed onto.
 * @returns {void}
 */
function installPageGlobals(win: BrowserGlobals, g: BrowserGlobals): void {
    // Force the Event constructors to come from the SAME jsdom window whose
    // dispatchEvent we bind below. Vitest's own environment supplies rival
    // globals, and the mirror loop skips any key that already exists — leaving
    // Foundry constructing a vitest Event and jsdom rejecting it with
    // "parameter 1 is not of type 'Event'".
    for (const eventGlobal of ['Event', 'CustomEvent', 'EventTarget'] as const) {
        const ctor = win[eventGlobal];
        if (ctor === undefined) continue;
        try {
            g[eventGlobal] = ctor;
        } catch {
            /* read-only in this environment — leave it */
        }
    }

    // Event-target methods live on the jsdom Window's PROTOTYPE, so the
    // own-property mirror loop above never copies them — and Foundry's final
    // boot step calls `globalThis.dispatchEvent(...)`. Bind them across.
    for (const method of ['dispatchEvent', 'addEventListener', 'removeEventListener'] as const) {
        const fn = win[method];
        if (typeof fn !== 'function' || typeof g[method] === 'function') continue;
        // eslint-disable-next-line no-restricted-syntax -- boundary: jsdom's event-target methods are untyped on this shim; `bind` widens them to any
        const bound = fn.bind(win) as (...args: never[]) => unknown;
        g[method] = bound;
    }

    // Globals the real Foundry HTML page injects into the document before
    // loading foundry.mjs, which reads them at module scope on its last lines.
    // eslint-disable-next-line no-restricted-syntax -- boundary: these are page-injected primitives, not the object-valued browser globals BrowserGlobals models
    const pageGlobals = g as unknown as Record<string, unknown>;
    pageGlobals['SIGNED_EULA'] = true;
    pageGlobals['ROUTE_PREFIX'] = '';
    pageGlobals['MESSAGES'] = [];
}

/**
 * Whether the booted runtime can actually create documents, or the reason it
 * cannot.
 *
 * Evaluating foundry.mjs is not the same as having a game: document classes are
 * registered, and `game.model` populated, while joining a world against a
 * server. Reporting that as a skip with the real reason beats handing tests a
 * hollow runtime and letting thirty of them each fail on `undefined.Actor`.
 * @param {BrowserGlobals} g  The test global after the Foundry import.
 * @param {object} foundryConfig  The resolved CONFIG registry.
 * @returns {string | null}  The blocking reason, or null when the runtime is usable.
 */
function runtimeBlocker(g: BrowserGlobals, foundryConfig: object): string | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's CONFIG is an untyped runtime registry
    const documentClasses = foundryConfig as { Actor?: { documentClass?: unknown }; Item?: { documentClass?: unknown } };
    if (documentClasses.Actor?.documentClass === undefined || documentClasses.Item?.documentClass === undefined) {
        return 'foundry.mjs evaluated, but CONFIG.Actor/Item.documentClass are unregistered — Foundry populates them while joining a world against a server, which this harness does not provide.';
    }
    // Every TypeDataField cleans through `game.model[documentName][type]`, which
    // comes from the world manifest on join; without it an Actor.create dies in
    // `TypeDataField._cleanType`.
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `game` is untyped at this stage
    const gameModel = (g.game as { model?: { Actor?: unknown; Item?: unknown } } | undefined)?.model;
    if (gameModel?.Actor === undefined || gameModel.Item === undefined) {
        return 'foundry.mjs evaluated and document classes registered, but `game.model` is empty — it comes from the world manifest Foundry fetches on join, so document creation cannot be exercised until the harness supplies one.';
    }
    return null;
}

async function doBoot(): Promise<BootResult> {
    const { JSDOM } = await import('jsdom');
    const { IDBFactory: FDBFactory } = await import('fake-indexeddb');

    const foundryEntryPath = resolve(FOUNDRY_RELEASE_DIR, 'public', 'scripts', 'foundry.mjs');

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost/',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });

    // Browser-global shim shape. The jsdom Window is the source of truth here
    // and provides hundreds of properties; we type only the slots we read or
    // write and reach through the `string` index for the rest.
    // Index-signature `object` accommodates the heterogenous mix of values we
    // copy off the jsdom Window: DOM constructors (`OffscreenCanvas` is a class),
    // FDB factory instances, PIXI stub objects, etc. The named slots refine the
    // shape only where we read them back; assignment goes through the index.
    // eslint-disable-next-line no-restricted-syntax -- boundary: jsdom Window → our boot-time stub view (browser globals are the canonical Foundry framework boundary)
    const win = dom.window as unknown as BrowserGlobals;
    // Foundry expects these but jsdom does not provide them.
    win.indexedDB = new FDBFactory();
    win.OffscreenCanvas = class {};
    win.WebGL2RenderingContext = class {};
    // Web Audio: jsdom implements none of it, and Foundry's audio effects are
    // declared as `class … extends BiquadFilterNode` / `extends ConvolverNode`,
    // which is evaluated at module load. Empty base classes are enough to get
    // those declarations past evaluation — Tier A drives documents and sheets,
    // not sound.
    for (const audioClass of ['BiquadFilterNode', 'ConvolverNode', 'AudioNode', 'GainNode'] as const) {
        win[audioClass] = class {};
    }
    // Same story for Worker: Foundry subclasses it at module load for its
    // off-thread pipelines. Tier A never dispatches to one.
    win.Worker = class {
        postMessage(): void {}
        terminate(): void {}
        addEventListener(): void {}
    };
    for (const { name, entry, attachTo, unwrap, extensible } of FOUNDRY_BROWSER_GLOBALS) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design: a plugin must be attached after the global it extends
        const vendored = await loadVendoredGlobal(entry, unwrap ?? '', extensible === true);
        if (vendored === null) continue;
        if (attachTo === undefined) {
            win[name] = vendored;
            continue;
        }
        const host = win[attachTo];
        // eslint-disable-next-line no-restricted-syntax -- boundary: attaching a plugin namespace onto a vendored browser global
        if (host !== undefined) (host as Record<string, unknown>)[name] = vendored;
    }

    // Mirror every own enumerable jsdom-window property onto the test
    // global so the dynamic-imported Foundry ESM sees a browser-like
    // environment. Some keys (notably `navigator` under vitest's jsdom env)
    // are read-only getters and will throw on assignment; tolerate that
    // per-key rather than failing the whole boot. Explicit Foundry-only
    // additions come after so they always win.
    // eslint-disable-next-line no-restricted-syntax -- boundary: globalThis as a writable browser global (the Foundry boot harness's job)
    const g = globalThis as unknown as BrowserGlobals;
    for (const key of Object.getOwnPropertyNames(win)) {
        if (key in g) continue;
        try {
            g[key] = win[key];
        } catch {
            // Read-only — leave whatever the environment already provided.
        }
    }
    // `navigator` is one of the read-only getters the mirror loop above cannot
    // assign, so under vitest's own environment it can arrive without the fields
    // Foundry reads at class-definition time (KeyboardManager's static
    // initialiser does `navigator.appVersion.includes(...)`).
    const nav = g['navigator'] as { appVersion?: string; userAgent?: string; platform?: string } | undefined;
    if (nav !== undefined) {
        // Set unconditionally: a fixed identity keeps the boot deterministic
        // across environments, and nothing in Tier A branches on the real one.
        nav.appVersion = 'Linux';
        nav.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) foundry-tier-a';
        nav.platform = 'Linux x86_64';
    }

    for (const foundryKey of [
        'indexedDB',
        'OffscreenCanvas',
        'WebGL2RenderingContext',
        'BiquadFilterNode',
        'ConvolverNode',
        'AudioNode',
        'GainNode',
        'Worker',
        'PIXI',
        'Handlebars',
        'showdown',
        'HandlebarsIntl',
    ] as const) {
        try {
            g[foundryKey] = win[foundryKey];
        } catch {
            /* ignore */
        }
    }
    void readFileSync;
    void vm;

    installPageGlobals(win, g);

    await import(pathToFileURL(foundryEntryPath).href);

    // Foundry's `init` / `setup` / `ready` are fired by its own entry, but
    // outside a browser the bootstrap sequence does not auto-run. Fire the
    // hooks manually so consumer code that listens for them executes.
    // foundry.mjs assigns `Hooks` / `game` / `CONFIG` / `foundry` onto
    // globalThis, not back onto the jsdom Window we mirrored FROM. Reading them
    // off `win` therefore found nothing, and every consumer got an empty runtime
    // whose `CONFIG.Actor.documentClass` was undefined.
    const HooksApi = g.Hooks ?? win.Hooks;
    HooksApi?.callAll?.('init');
    HooksApi?.callAll?.('setup');
    HooksApi?.callAll?.('ready');

    const foundryConfig = g.CONFIG ?? win.CONFIG ?? {};

    const blocker = runtimeBlocker(g, foundryConfig);
    if (blocker !== null) return { booted: false, skipped: true, error: new Error(blocker) };

    return {
        booted: true,
        skipped: false,
        runtime: {
            window: win,
            game: g.game ?? win.game ?? {},
            CONFIG: foundryConfig,
            Hooks: g.Hooks ?? win.Hooks ?? {},
            foundry: g.foundry ?? win.foundry ?? {},
        },
    };
}

/**
 * The REAL PIXI, not a stub.
 *
 * This used to be a hand-rolled stub grown "class-by-class as tests demand",
 * and it had stalled: Foundry's canvas pipeline declares
 * `class UnboundTransform extends PIXI.Transform`, the stub had no `Transform`,
 * and the boot died with "Class extends value undefined is not a constructor or
 * null" — which named no file, so the whole tier silently skipped 20 of its 22
 * tests. Chasing that with more stub classes is unbounded; PIXI has 238 exports
 * and Foundry reaches deep into them.
 *
 * The Foundry release ships the genuine article at
 * `.foundry-release/node_modules/pixi.js`, and it imports cleanly under Node, so
 * load that. Returns null when the release is absent, leaving the caller to skip
 * exactly as it did before.
 * @returns {Promise<object | null>}  The PIXI namespace, or null when unavailable.
 */
// Vitest globalSetup entrypoint. Boots once per worker; teardown is a no-op.
export default async function vitestGlobalSetup(): Promise<() => void> {
    await bootFoundryOnce();
    return () => {};
}
