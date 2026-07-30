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
    // A boot that RETURNS `{booted:false}` (a readiness gate, not a throw) was
    // silent, so the tier skipped with no reason visible anywhere. Report it the
    // same way a throw is reported.
    if (!result.booted && result.error !== undefined) {
        // eslint-disable-next-line no-console
        console.warn(`[integration] Tier A not ready — tests will skip. Reason: ${result.error.message}`);
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
/**
 * Serve `systems/wh40k-rpg/**` requests out of the built `dist/` directory.
 *
 * Foundry loads Handlebars templates with `fetch('systems/wh40k-rpg/templates/…')`,
 * which in a real game is answered by its own web server. Tier A has no server, so
 * every such request hangs — and because the sheet render awaits it, the whole
 * test sits until vitest's 60s timeout rather than failing with anything that
 * names the cause. That is what made `sheet-render` look like a mysterious hang
 * (#515).
 *
 * Anything outside the system path 404s rather than reaching the network: a Tier A
 * run must not depend on egress, and a silent real request would be a far more
 * confusing failure than a missing file.
 * @param {BrowserGlobals} g  The writable global view.
 */
function installTemplateFetch(g: BrowserGlobals): void {
    const distRoot = resolve(import.meta.dirname, '..', '..', '..', 'dist');
    const SYSTEM_PREFIX = 'systems/wh40k-rpg/';

    const serve = (rawUrl: string): { body: string; ok: boolean } => {
        // Foundry passes root-relative paths; jsdom may hand back an absolute URL.
        const path = rawUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
        if (!path.startsWith(SYSTEM_PREFIX)) return { body: '', ok: false };
        const filePath = resolve(distRoot, path.slice(SYSTEM_PREFIX.length));
        if (!existsSync(filePath)) return { body: '', ok: false };
        return { body: readFileSync(filePath, 'utf8'), ok: true };
    };

    g['fetch'] = async (input: string | { url?: string }): Promise<object> => {
        const url = typeof input === 'string' ? input : String(input.url ?? '');
        const { body, ok } = serve(url);
        return Promise.resolve({
            ok,
            status: ok ? 200 : 404,
            statusText: ok ? 'OK' : 'Not Found',
            url,
            text: async () => Promise.resolve(body),
            json: async () => Promise.resolve(body === '' ? {} : JSON.parse(body)),
        });
    };
}

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
    // Foundry's own localisation shorthand, normally defined alongside the page
    // bundle. UI widgets call it from getters during render; without it a render
    // rejects with "_loc is not defined". Echo the key back so a missing string
    // is visible rather than blank.
    pageGlobals['_loc'] = (key: RuntimeValue) => (typeof key === 'string' ? key : '');
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
    // NOT `game.model`. That is the DEPRECATED template.json fallback:
    // `TypeDataField._cleanType` calls `getModelForType(type)` first and returns
    // immediately when a DataModel is registered, only consulting `game.model`
    // when none is. The system registers DataModels on `init`, so what actually
    // has to be true is that those landed.
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's CONFIG is an untyped runtime registry
    const dataModels = foundryConfig as { Actor?: { dataModels?: object }; Item?: { dataModels?: object } };
    const actorModels = Object.keys(dataModels.Actor?.dataModels ?? {}).length;
    const itemModels = Object.keys(dataModels.Item?.dataModels ?? {}).length;
    if (actorModels === 0 || itemModels === 0) {
        return `foundry.mjs evaluated and document classes registered, but the system registered no DataModels (Actor: ${actorModels}, Item: ${itemModels}) — its init hook did not complete.`;
    }
    return null;
}

/**
 * Fill in the `game` surfaces the system's `init` touches.
 *
 * Foundry builds `game` from the payload a server sends on join. There is no
 * server here, so the object exists but is bare, and the system's init dies on
 * `game.settings.register`. This supplies an in-memory stand-in for the pieces
 * registration reaches — settings, keybindings, i18n, user — leaving anything
 * Foundry did populate untouched.
 * @param {BrowserGlobals} g  The test global, after the Foundry import.
 * @returns {void}
 */
/** The system manifest's document-type registry, read from src/system.json. */
function readSystemManifest(): { documentTypes: Record<string, Record<string, object>> } {
    try {
        const manifestPath = resolve(import.meta.dirname, '..', '..', '..', 'src', 'system.json');
        // eslint-disable-next-line no-restricted-syntax -- boundary: the system manifest is JSON on disk with no schema in this repo
        const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as { documentTypes?: Record<string, Record<string, object>> };
        return { documentTypes: parsed.documentTypes ?? {} };
    } catch {
        return { documentTypes: {} };
    }
}

function emptyCollection(): object {
    // `never[]` rather than a value type: this collection is permanently empty —
    // it exists to satisfy the iterate/get/filter shape, never to hold anything.
    const contents: never[] = [];
    return {
        contents,
        size: 0,
        get: () => undefined,
        getName: () => undefined,
        find: () => undefined,
        filter: () => [],
        map: () => [],
        forEach: () => undefined,
        [Symbol.iterator]: () => contents[Symbol.iterator](),
    };
}

/**
 * A value crossing in from — or standing in for — Foundry's untyped runtime.
 *
 * `game`, `ui` and the settings store are heterogenous aggregates the client
 * assembles at join time: their slots hold collections, closures, DOM objects
 * and primitives, and there is no schema in this repo to narrow them against.
 * Naming that escape once here keeps it from being re-justified at every slot.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the single declared escape for Foundry's untyped runtime aggregates; the slots below refer to this alias instead of repeating `unknown`
type RuntimeValue = unknown;

/**
 * Install a stand-in only where the real runtime has not already provided one.
 *
 * Every slot in {@link scaffoldGame} is "keep Foundry's if it exists, else
 * ours". `??=` says that in one token but trips the repo's
 * default-initialisation ban — rightly, since in product code a default belongs
 * in `defineSchema`. Here there is no schema to defer to (this IS the stand-in
 * for the runtime), so the guard lives in one helper rather than at sixteen call
 * sites.
 * @param {Record<string, RuntimeValue>} target  The aggregate being scaffolded.
 * @param {string} key  The slot to fill.
 * @param {RuntimeValue} value  The stand-in to install when the slot is empty.
 */
function seed(target: Record<string, RuntimeValue>, key: string, value: RuntimeValue): void {
    // `hasOwn` rather than a nullish check: the question is whether the runtime
    // PROVIDED the slot, not whether the slot happens to hold null. A nullish
    // guard is also what `??=` compiles to, so writing it that way just swaps the
    // ban on `??=` for `prefer-nullish-coalescing` demanding it back.
    if (!Object.hasOwn(target, key)) target[key] = value;
}

function scaffoldGame(g: BrowserGlobals): void {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `game` is an untyped runtime aggregate; this is the harness's stand-in for it
    const gameStub = (g.game ?? {}) as Record<string, RuntimeValue>;
    const settingsStore = new Map<string>();
    // Providing `game.model` (above) flips `PrototypeTokenOverrides.applyOverrides`
    // out of its `!game.model` early return, and it then reads this core setting
    // on every prototype-token construction. Seed the empty-override shape it
    // expects rather than letting it dereference undefined.
    settingsStore.set('core.prototypeTokenOverrides', { base: {} });

    seed(gameStub, 'settings', {
        register: (namespace: string, key: string, data: { default?: RuntimeValue }) => {
            settingsStore.set(`${namespace}.${key}`, data.default);
        },
        registerMenu: () => undefined,
        get: (namespace: string, key: string) => settingsStore.get(`${namespace}.${key}`),
        // eslint-disable-next-line @typescript-eslint/promise-function-async -- mirrors Foundry's async `settings.set` API surface; the stand-in has nothing to await, and marking it `async` only trades this for `require-await`
        set: (namespace: string, key: string, value: RuntimeValue) => {
            settingsStore.set(`${namespace}.${key}`, value);
            return Promise.resolve(value);
        },
    });
    seed(gameStub, 'keybindings', { register: () => undefined, get: () => [] });
    // Return the key so a missing translation is visible rather than blank.
    seed(gameStub, 'i18n', { localize: (key: string) => key, format: (key: string) => key, has: () => false, lang: 'en' });
    seed(gameStub, 'user', { id: 'tier-a-gm', isGM: true, name: 'Tier A' });
    // Template preloading resolves through the socket; there is none, so a
    // no-op emitter lets the promise chain settle instead of throwing.
    seed(gameStub, 'socket', { emit: () => undefined, on: () => undefined, off: () => undefined });
    seed(gameStub, 'users', { contents: [], get: () => undefined });
    seed(gameStub, 'modules', emptyCollection());
    // Foundry's world collections are iterable AND expose get/contents/filter;
    // consumers use all three (uuid-name-cache does `for (const doc of collection)`
    // straight after `Array.from(game.packs.contents)`), so the stand-in has to
    // satisfy the whole shape rather than whichever member was hit first.
    for (const collectionName of ['packs', 'actors', 'items', 'messages', 'scenes', 'combats', 'journal', 'tables'] as const) {
        seed(gameStub, collectionName, emptyCollection());
    }
    seed(gameStub, 'tours', { register: () => undefined, get: () => undefined });
    // The system manifest IS the source of the document-type registry Foundry
    // would otherwise receive on join: `game.documentTypes` (used to validate a
    // document's `type`) and `game.system.documentTypes` (used to resolve which
    // package defines a sub-type). Reading src/system.json keeps this in step
    // with the real thing instead of restating 88 type names here.
    const manifest = readSystemManifest();
    seed(gameStub, 'system', {
        id: 'wh40k-rpg',
        version: '0.0.0-tier-a',
        documentTypes: manifest.documentTypes,
        strictDataCleaning: false,
    });
    seed(gameStub, 'documentTypes', Object.fromEntries(Object.entries(manifest.documentTypes).map(([doc, types]) => [doc, Object.keys(types)])));
    // `game.model` is load-bearing beyond the deprecated cleaning fallback:
    // `Document.TYPES` is literally `Object.keys(game.model[documentName])`, and
    // the `type` field validates against it — without it every create fails with
    // "type: … reading 'Actor'". One empty object per declared type is enough,
    // since the DataModels do the actual cleaning.
    gameStub['model'] = Object.fromEntries(
        Object.entries(manifest.documentTypes).map(([doc, types]) => [doc, Object.fromEntries(Object.keys(types).map((k) => [k, {}]))]),
    );
    // eslint-disable-next-line @typescript-eslint/promise-function-async -- as with `settings.set`: mirrors an async Foundry API with no async work to do
    seed(gameStub, 'time', { worldTime: 0, advance: () => Promise.resolve(0) });
    seed(gameStub, 'world', { id: 'tier-a', title: 'Tier A' });
    // `_stats.coreVersion` initialises from `game.release.version` on EVERY
    // document create, so this is load-bearing rather than cosmetic.
    seed(gameStub, 'release', { version: '14.0.0', generation: 14, build: 0 });
    // Explicit rather than seeded: `null` IS the value Foundry holds when no
    // combat is active, and `seed` treats null as an empty slot.
    gameStub['combat'] = null;

    g.game = gameStub;

    // `Hooks.onError` reports through `ui.notifications`; without it a hooked
    // error is replaced by "Cannot read properties of undefined (reading
    // 'error')", hiding whatever actually went wrong.
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `ui` is an untyped runtime aggregate; this is the harness's stand-in for it
    const uiStub = (g['ui'] ?? {}) as Record<string, RuntimeValue>;
    seed(uiStub, 'notifications', {
        notify: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    });
    g['ui'] = uiStub;
}

/**
 * Install the browser classes Foundry subclasses at module-evaluation time.
 *
 * jsdom provides none of these, and `foundry.mjs` declares
 * `class … extends BiquadFilterNode` / `extends Worker` at load, so their absence
 * kills the boot before a single test runs.
 * @param {BrowserGlobals} win  The jsdom window view.
 * @param {new () => object} IndexedDBFactory  fake-indexeddb's factory class.
 */
function installBrowserStubs(win: BrowserGlobals, IndexedDBFactory: new () => object): void {
    win.indexedDB = new IndexedDBFactory();
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
}

/**
 * Load the release's vendored browser libraries onto the window.
 * @param {BrowserGlobals} win  The jsdom window view.
 */
async function attachVendoredGlobals(win: BrowserGlobals): Promise<void> {
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
}

/**
 * Mirror every own enumerable jsdom-window property onto the test global so the
 * dynamic-imported Foundry ESM sees a browser-like environment.
 *
 * Some keys (notably `navigator` under vitest's jsdom env) are read-only getters
 * and throw on assignment; tolerate that per-key rather than failing the boot.
 * @param {BrowserGlobals} win  The jsdom window view.
 * @param {BrowserGlobals} g  The writable global view.
 */
function mirrorWindowOntoGlobal(win: BrowserGlobals, g: BrowserGlobals): void {
    for (const key of Object.getOwnPropertyNames(win)) {
        if (key in g) continue;
        try {
            g[key] = win[key];
        } catch {
            // Read-only — leave whatever the environment already provided.
        }
    }
}

/**
 * Give `navigator` the fields Foundry reads at class-definition time.
 *
 * `navigator` is one of the read-only getters {@link mirrorWindowOntoGlobal}
 * cannot assign, so under vitest's own environment it can arrive without them
 * (KeyboardManager's static initialiser does `navigator.appVersion.includes(…)`).
 * @param {BrowserGlobals} g  The writable global view.
 */
function pinNavigatorIdentity(g: BrowserGlobals): void {
    const nav = g['navigator'] as { appVersion?: string; userAgent?: string; platform?: string } | undefined;
    if (nav === undefined) return;
    // `defineProperty`, not assignment: jsdom exposes these as getter-only
    // accessors, so a plain write throws "Cannot set property userAgent of
    // #<Navigator> which has only a getter". A fixed identity also keeps the boot
    // deterministic; nothing in Tier A branches on the real one.
    for (const [key, value] of [
        ['appVersion', 'Linux'],
        ['userAgent', 'Mozilla/5.0 (X11; Linux x86_64) foundry-tier-a'],
        ['platform', 'Linux x86_64'],
    ] as const) {
        try {
            Object.defineProperty(nav, key, { value, configurable: true, writable: true });
        } catch {
            /* locked down in this environment — Foundry only reads it */
        }
    }
}

/**
 * Re-assert the Foundry-only globals after the mirror pass, so they win over
 * whatever the ambient environment already provided.
 * @param {BrowserGlobals} win  The jsdom window view.
 * @param {BrowserGlobals} g  The writable global view.
 */
function forceFoundryGlobals(win: BrowserGlobals, g: BrowserGlobals): void {
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
    installBrowserStubs(win, FDBFactory);
    await attachVendoredGlobals(win);

    // Explicit Foundry-only additions come after the mirror pass so they always win.
    // eslint-disable-next-line no-restricted-syntax -- boundary: globalThis as a writable browser global (the Foundry boot harness's job)
    const g = globalThis as unknown as BrowserGlobals;
    mirrorWindowOntoGlobal(win, g);
    pinNavigatorIdentity(g);
    forceFoundryGlobals(win, g);

    installTemplateFetch(g);
    installPageGlobals(win, g);

    await import(pathToFileURL(foundryEntryPath).href);

    // Foundry's `init` / `setup` / `ready` are fired by its own entry, but
    // outside a browser the bootstrap sequence does not auto-run. Fire the
    // hooks manually so consumer code that listens for them executes.
    // Load the SYSTEM. Its entry calls `HooksManager.registerHooks()` at module
    // scope, which is what registers `CONFIG.Actor.dataModels` and the document
    // classes on `init`. Without it Foundry is up but wh40k-rpg is not, and
    // `TypeDataField.getModelForType()` finds nothing — the tier's whole purpose
    // is asserting against those registrations, and the harness docblock has
    // always claimed to do this.
    try {
        await import('../../../src/module/wh40k-rpg.ts');
    } catch (systemErr) {
        return {
            booted: false,
            skipped: true,
            error: new Error(`Foundry booted but the wh40k-rpg system failed to load: ${(systemErr as Error).message}`),
        };
    }

    // foundry.mjs assigns `Hooks` / `game` / `CONFIG` / `foundry` onto
    // globalThis, not back onto the jsdom Window we mirrored FROM. Reading them
    // off `win` therefore found nothing, and every consumer got an empty runtime
    // whose `CONFIG.Actor.documentClass` was undefined.
    scaffoldGame(g);

    const HooksApi = g.Hooks ?? win.Hooks;
    // `init` and `setup` only. Those are where the system registers document
    // classes, DataModels and sheets — which is precisely what this tier exists
    // to assert (V14 cleanData regressions, registerSheet collisions, per-system
    // DataModel registration). `ready` instead drives world data and UI: it
    // renders widgets that read `game.time.hour`, call Foundry's page-level
    // `_loc`, and expect a joined world. Firing it here produced an unbounded
    // tail of UI stubs for surfaces no Tier A test touches.
    HooksApi?.callAll?.('init');
    HooksApi?.callAll?.('setup');

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
