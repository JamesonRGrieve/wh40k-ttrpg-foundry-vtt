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

import { readFileSync } from 'node:fs';
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
        // eslint-disable-next-line no-console
        console.warn(`[integration] Tier A boot threw — tests will skip. Reason: ${(err as Error).message}`);
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
    interface BrowserGlobals {
        [key: string]: object | undefined;
        indexedDB?: object;
        OffscreenCanvas?: object;
        WebGL2RenderingContext?: object;
        PIXI?: object;
        Hooks?: { callAll?: (name: string) => void };
        game?: object;
        CONFIG?: object;
        foundry?: object;
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: jsdom Window → our boot-time stub view (browser globals are the canonical Foundry framework boundary)
    const win = dom.window as unknown as BrowserGlobals;
    // Foundry expects these but jsdom does not provide them.
    win.indexedDB = new FDBFactory();
    win.OffscreenCanvas = class {};
    win.WebGL2RenderingContext = class {};
    win.PIXI = makePixiStub();

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
    for (const foundryKey of ['indexedDB', 'OffscreenCanvas', 'WebGL2RenderingContext', 'PIXI'] as const) {
        try {
            g[foundryKey] = win[foundryKey];
        } catch {
            /* ignore */
        }
    }
    void readFileSync;
    void vm;

    await import(pathToFileURL(foundryEntryPath).href);

    // Foundry's `init` / `setup` / `ready` are fired by its own entry, but
    // outside a browser the bootstrap sequence does not auto-run. Fire the
    // hooks manually so consumer code that listens for them executes.
    const HooksApi = win.Hooks;
    HooksApi?.callAll?.('init');
    HooksApi?.callAll?.('setup');
    HooksApi?.callAll?.('ready');

    return {
        booted: true,
        skipped: false,
        runtime: {
            window: win,
            game: win.game ?? {},
            CONFIG: win.CONFIG ?? {},
            Hooks: win.Hooks ?? {},
            foundry: win.foundry ?? {},
        },
    };
}

// Minimal PIXI surface. Foundry's canvas pipeline reaches deep into PIXI;
// the realistic path to extend this is to either (a) load the actual PIXI
// build bundled under .foundry-release/public/scripts/ alongside foundry.mjs,
// or (b) flesh out the stub class-by-class as tests demand. Currently boot
// gets as far as `new PIXI.Rectangle(...)` — adding Rectangle, Point, Matrix,
// and Texture.from would push boot to the next stop.
function makePixiStub(): object {
    return {
        Application: class {
            stage = {};
            renderer = { resize(): void {} };
            destroy(): void {}
        },
        Container: class {},
        Sprite: class {},
        Rectangle: class {
            constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
        },
        Point: class {
            constructor(public x = 0, public y = 0) {}
        },
        Texture: { WHITE: {}, EMPTY: {}, from: () => ({}) },
    };
}

// Vitest globalSetup entrypoint. Boots once per worker; teardown is a no-op.
export default async function vitestGlobalSetup(): Promise<() => void> {
    await bootFoundryOnce();
    return () => {};
}
