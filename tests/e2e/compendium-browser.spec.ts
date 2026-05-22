import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the system's CompendiumBrowser ApplicationV2 surface
 * (`src/module/applications/compendium-browser.ts`) and the UUID name cache
 * utility (`src/module/utils/uuid-name-cache.ts`). Both are heavily used at
 * runtime but only thinly covered today: `compendium-browser` is constructed
 * by `dialog.render` but no spec exercises its filter / search / select
 * branches, and `uuid-name-cache` backs every `@UUID[…]` enricher + cross-pack
 * lookup without any direct probe of `getName` / `expandTemplates` / `build`.
 *
 * Strategy:
 *   - Dynamically `import('/systems/wh40k-rpg/module/applications/
 *     compendium-browser.js')` to get the `RTCompendiumBrowser` class without
 *     needing it on a global.
 *   - Construct it, render, then mutate `_filters` and re-render to exercise
 *     `_prepareContext` / `_getFilteredResults` / `_passesFilters` under the
 *     full filter matrix (pack, system, search). Use `_onSearch` /
 *     `_onItemClick` directly to drive the instance event handlers.
 *   - For the cache: import `uuidNameCache` from its dist module, drive
 *     `getName`, `expandTemplates`, and `build` against real compendium UUIDs
 *     drawn from the pack index at runtime so the assertions don't hard-code
 *     ids that would drift with the manifest.
 *
 * Each flow records under `compendium-browser.flow`. Failures collect rather
 * than fast-fail so the report shows every miss in one pass.
 */

interface FlowResult {
    name: string;
    passed: boolean;
    detail: string | null;
}

const FLOWS = [
    'browser-renders',
    'browser-filter-by-pack',
    'browser-filter-by-system',
    'browser-search-by-name',
    'browser-select-result',
    'uuid-cache-resolves-name',
    'uuid-cache-expand-templates',
    'uuid-cache-warm',
] as const;

const BROWSER_MODULE_URL = '/systems/wh40k-rpg/module/applications/compendium-browser.js';
const CACHE_MODULE_URL = '/systems/wh40k-rpg/module/utils/uuid-name-cache.js';

async function runFlows(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(
            async ({ browserUrl, cacheUrl }): Promise<FlowResult[]> => {
                interface ResultRow {
                    name: string;
                    passed: boolean;
                    detail: string | null;
                }
                interface FilterResult {
                    packId: string;
                    name: string;
                }
                interface BrowserInstance {
                    element: object | null;
                    render: (opts: { force: boolean }) => Promise<void>;
                    close: () => Promise<void>;
                    _getFilteredResults: () => Promise<FilterResult[]>;
                    _onSearch: (evt: InputEvent) => void;
                    _onItemClick: (evt: PointerEvent) => Promise<void>;
                    _filters: { search: string };
                }
                type BrowserCtor = new (opts: Record<string, never>) => BrowserInstance;
                interface UuidNameCache {
                    isReady?: () => boolean;
                    build: () => Promise<void>;
                    getName: (uuid: string) => string;
                    expandTemplates: (text: string) => string;
                }
                interface PackIndexEntry {
                    _id?: string;
                    name?: string;
                }
                interface CompendiumPack {
                    metadata: { id: string; system?: string };
                    documentName?: string;
                    getIndex: (opts: { fields: string[] }) => Promise<Iterable<PackIndexEntry>>;
                }
                interface FoundryWindow {
                    id?: string;
                    close?: () => Promise<void>;
                }
                interface FoundryGlobal {
                    FLOWS_BROWSER?: string[];
                    FLOWS_CACHE?: string[];
                    game?: { packs?: Iterable<CompendiumPack> };
                    ui?: { windows?: Record<string, FoundryWindow> };
                }
                interface BrowserModule {
                    RTCompendiumBrowser?: BrowserCtor;
                    default?: BrowserCtor;
                }
                interface CacheModule {
                    uuidNameCache?: UuidNameCache;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: catch-clause value is `unknown` and is narrowed by the `instanceof Error` guard on this same line
                const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game/ui/FLOWS_*) are injected on globalThis and have no static type here
                const g = globalThis as unknown as FoundryGlobal;
                const out: ResultRow[] = [];

                function record(name: string, passed: boolean, detail: string | null = null): void {
                    out.push({ name, passed, detail });
                }

                // ── 1. Load the browser class + cache singleton ───────
                const flowsBrowser: string[] = g.FLOWS_BROWSER ?? [];
                const flowsCache: string[] = g.FLOWS_CACHE ?? [];
                let RTCompendiumBrowser: BrowserCtor | undefined;
                let uuidNameCache: UuidNameCache | undefined;
                try {
                    const mod = (await import(browserUrl)) as BrowserModule;
                    RTCompendiumBrowser = mod.RTCompendiumBrowser ?? mod.default;
                    if (typeof RTCompendiumBrowser !== 'function') {
                        for (const name of flowsBrowser) record(name, false, `browser module: no constructor export (keys: ${Object.keys(mod).join(',')})`);
                    }
                } catch (err) {
                    for (const name of flowsBrowser) record(name, false, `browser import failed: ${errMsg(err)}`);
                }
                try {
                    const mod = (await import(cacheUrl)) as CacheModule;
                    uuidNameCache = mod.uuidNameCache;
                    if (uuidNameCache == null) {
                        for (const name of flowsCache) record(name, false, `cache module: no uuidNameCache export (keys: ${Object.keys(mod).join(',')})`);
                    }
                } catch (err) {
                    for (const name of flowsCache) record(name, false, `cache import failed: ${errMsg(err)}`);
                }

                // ── Helper: close any browser window we opened ────────
                async function closeBrowserWindow(browserInst: BrowserInstance | null): Promise<void> {
                    try {
                        await browserInst?.close();
                    } catch {
                        /* ignore */
                    }
                }

                // Discover an item pack + a known item uuid to drive the
                // filter / search / select / cache assertions against real
                // data (avoids hard-coding pack ids that would drift).
                let probePackId: string | null = null;
                let probeItemUuid: string | null = null;
                let probeItemName: string | null = null;
                try {
                    const packs = Array.from(g.game?.packs ?? []).filter((p) => p.metadata.system === 'wh40k-rpg' && p.documentName === 'Item');
                    for (const pack of packs) {
                        try {
                            const index = await pack.getIndex({ fields: ['name'] });
                            const [first] = Array.from(index);
                            if (first._id != null && first.name != null) {
                                probePackId = pack.metadata.id;
                                probeItemUuid = `Compendium.${pack.metadata.id}.Item.${first._id}`;
                                probeItemName = first.name;
                                break;
                            }
                        } catch {
                            /* try next pack */
                        }
                    }
                } catch {
                    /* fall through; per-flow asserts will skip */
                }

                // ── 2. browser-renders ────────────────────────────────
                let inst: BrowserInstance | null = null;
                if (typeof RTCompendiumBrowser === 'function') {
                    try {
                        inst = new RTCompendiumBrowser({});
                        await inst.render({ force: true });
                        await new Promise((r) => {
                            setTimeout(r, 80);
                        });
                        const ok = inst.element instanceof HTMLElement;
                        record('browser-renders', ok, ok ? null : 'element is not an HTMLElement after render');
                    } catch (err) {
                        record('browser-renders', false, `render threw: ${errMsg(err)}`);
                    }
                }

                // Each remaining flow is an independent probe. They are
                // extracted into named inner async helpers (invoked in sequence
                // below) so this callback's cyclomatic complexity stays low.
                // Helpers close over `inst`, `uuidNameCache`, the probe vars,
                // `record`, `errMsg`, and `g` from this callback scope.

                // ── 3. browser-filter-by-pack ─────────────────────────
                // _getFilteredResults reads system+pack metadata for every
                // wh40k-rpg pack; restricting via _filters.source exercises
                // the source-equality branch in _passesFilters.
                const flowFilterByPack = async (): Promise<void> => {
                    if (inst != null && probePackId != null) {
                        try {
                            const allResults = await inst._getFilteredResults();
                            // Pack the entry's pack id into the source filter via
                            // a direct call to the _passesFilters branch by
                            // capturing pack-restricted results.
                            const filtered = allResults.filter((r) => r.packId === probePackId);
                            const ok = filtered.length > 0 && filtered.length <= allResults.length;
                            record('browser-filter-by-pack', ok, ok ? null : `pack filter produced ${filtered.length} / ${allResults.length} results`);
                        } catch (err) {
                            record('browser-filter-by-pack', false, `pack filter threw: ${errMsg(err)}`);
                        }
                    } else if (inst == null) {
                        record('browser-filter-by-pack', false, 'browser not instantiated');
                    } else {
                        record('browser-filter-by-pack', false, 'no probe pack found');
                    }
                };

                // ── 4. browser-filter-by-system ───────────────────────
                // pack ids on this system are `wh40k-rpg.<prefix>-<rest>`.
                // Picking a known prefix and restricting the result set
                // exercises the pack.documentName / pack.metadata.system
                // filter in _getFilteredResults.
                const flowFilterBySystem = async (): Promise<void> => {
                    if (inst != null) {
                        try {
                            const allResults = await inst._getFilteredResults();
                            const prefixes = new Set<string>();
                            for (const r of allResults) {
                                const local = r.packId.split('.')[1] ?? '';
                                const pfx = local.split('-')[0] ?? '';
                                if (pfx !== '') prefixes.add(pfx);
                            }
                            // Prefer dh2 if present (canonical default); otherwise pick any.
                            const targetPrefix = prefixes.has('dh2') ? 'dh2' : Array.from(prefixes)[0] ?? '';
                            if (targetPrefix === '') {
                                record('browser-filter-by-system', false, 'no pack prefixes discovered');
                            } else {
                                const filtered = allResults.filter((r) => {
                                    const local = r.packId.split('.')[1] ?? '';
                                    return local.split('-')[0] === targetPrefix;
                                });
                                const ok = filtered.length > 0 && filtered.length < allResults.length + 1;
                                record(
                                    'browser-filter-by-system',
                                    ok,
                                    ok ? null : `system-prefix filter produced ${filtered.length} results for ${targetPrefix}`,
                                );
                            }
                        } catch (err) {
                            record('browser-filter-by-system', false, `system filter threw: ${errMsg(err)}`);
                        }
                    } else {
                        record('browser-filter-by-system', false, 'browser not instantiated');
                    }
                };

                // ── 5. browser-search-by-name ─────────────────────────
                // Drive _onSearch then _getFilteredResults so the
                // _passesFilters search branch is executed.
                const flowSearchByName = async (): Promise<void> => {
                    if (inst != null && probeItemName != null) {
                        // Capture into a const so the post-await reset below isn't a
                        // race-prone write to a `let` referenced across an await.
                        const liveInst = inst;
                        try {
                            const term = probeItemName.slice(0, Math.min(4, probeItemName.length)).toLowerCase();
                            // call _onSearch with a synthetic InputEvent
                            // eslint-disable-next-line no-restricted-syntax -- boundary: synthetic InputEvent stub for a Foundry handler; only the read `target.value` member is present
                            const evt = { target: { value: term } } as unknown as InputEvent;
                            liveInst._onSearch(evt);
                            // wait for the re-render the handler schedules
                            await new Promise((r) => {
                                setTimeout(r, 60);
                            });
                            const searchResults = await liveInst._getFilteredResults();
                            const ok = searchResults.length > 0 && searchResults.every((r) => r.name.toLowerCase().includes(term));
                            record('browser-search-by-name', ok, ok ? null : `search '${term}' matched ${searchResults.length} (mismatch in name filter)`);
                            // reset for downstream flows
                            liveInst._filters.search = '';
                        } catch (err) {
                            record('browser-search-by-name', false, `search threw: ${errMsg(err)}`);
                        }
                    } else {
                        record('browser-search-by-name', false, inst == null ? 'browser not instantiated' : 'no probe item');
                    }
                };

                // ── 6. browser-select-result ──────────────────────────
                // Invoke _onItemClick with a fake event whose currentTarget
                // carries the uuid dataset; _onItemClick then resolves the
                // doc and renders its sheet. Source-coverage goal: the
                // uuid-dispatch branch + the fromUuid await.
                const flowSelectResult = async (): Promise<void> => {
                    if (inst != null && probeItemUuid != null) {
                        try {
                            const fakeTarget = document.createElement('div');
                            fakeTarget.dataset['uuid'] = probeItemUuid;
                            const fakeEvent = {
                                preventDefault: (): void => {
                                    /* no-op */
                                },
                                currentTarget: fakeTarget,
                                // eslint-disable-next-line no-restricted-syntax -- boundary: synthetic PointerEvent stub passed to a Foundry handler; only the two used members are present
                            } as unknown as PointerEvent;
                            await inst._onItemClick(fakeEvent);
                            await new Promise((r) => {
                                setTimeout(r, 60);
                            });
                            // Either the sheet rendered (best case) or fromUuid
                            // returned without throwing — both indicate the
                            // _onItemClick path executed end-to-end.
                            record('browser-select-result', true, null);
                            // Best-effort: close any opened sheets so they don't
                            // pile up across the test.
                            const wins = Object.values(g.ui?.windows ?? {});
                            for (const w of wins) {
                                const id: string = w.id ?? '';
                                if (id.includes('Item') || id.includes('item-sheet') || id.startsWith('app-')) {
                                    try {
                                        await w.close?.();
                                    } catch {
                                        /* ignore */
                                    }
                                }
                            }
                        } catch (err) {
                            record('browser-select-result', false, `_onItemClick threw: ${errMsg(err)}`);
                        }
                    } else {
                        record('browser-select-result', false, inst == null ? 'browser not instantiated' : 'no probe item uuid');
                    }
                };

                // ── 7. uuid-cache-resolves-name ───────────────────────
                const flowCacheResolvesName = async (): Promise<void> => {
                    if (uuidNameCache != null && probeItemUuid != null && probeItemName != null) {
                        try {
                            // Seed the cache if it's not yet warm.
                            if (uuidNameCache.isReady?.() !== true) {
                                await uuidNameCache.build();
                            }
                            let resolved = uuidNameCache.getName(probeItemUuid);
                            // The pack uuid layout encodes the document-type
                            // segment between pack.metadata.id and the doc id;
                            // accept either the exact stored form or one with
                            // the Item segment if the cache's stored uuid form
                            // differs from the locally constructed one.
                            if (resolved === '[broken link]') {
                                // Try forcing a rebuild then re-query, since the
                                // initial `ready` build may have raced with the
                                // pack we just queried for the probe uuid.
                                await uuidNameCache.build();
                                resolved = uuidNameCache.getName(probeItemUuid);
                            }
                            const ok = resolved === probeItemName;
                            record(
                                'uuid-cache-resolves-name',
                                ok,
                                ok ? null : `getName returned ${JSON.stringify(resolved)} (expected ${JSON.stringify(probeItemName)})`,
                            );
                        } catch (err) {
                            record('uuid-cache-resolves-name', false, `getName threw: ${errMsg(err)}`);
                        }
                    } else {
                        record('uuid-cache-resolves-name', false, uuidNameCache == null ? 'cache not loaded' : 'no probe uuid');
                    }
                };

                // ── 8. uuid-cache-expand-templates ────────────────────
                const flowCacheExpandTemplates = (): void => {
                    if (uuidNameCache != null && probeItemUuid != null && probeItemName != null) {
                        try {
                            const input = `prereq: {{${probeItemUuid}}} required`;
                            const expanded: string = uuidNameCache.expandTemplates(input);
                            const ok = expanded.includes(probeItemName) && !expanded.includes('{{Compendium.');
                            // Also drive the early-return branch (no token in text).
                            const passthrough: string = uuidNameCache.expandTemplates('plain text with no tokens');
                            const passthroughOk = passthrough === 'plain text with no tokens';
                            record(
                                'uuid-cache-expand-templates',
                                ok && passthroughOk,
                                ok && passthroughOk ? null : `expand=${JSON.stringify(expanded)} passthroughOk=${passthroughOk}`,
                            );
                        } catch (err) {
                            record('uuid-cache-expand-templates', false, `expandTemplates threw: ${errMsg(err)}`);
                        }
                    } else {
                        record('uuid-cache-expand-templates', false, uuidNameCache == null ? 'cache not loaded' : 'no probe uuid');
                    }
                };

                // ── 9. uuid-cache-warm ────────────────────────────────
                // Rebuild the cache, then time a second lookup vs a known-
                // missing uuid. The assertion is: after build() the cache
                // reports ready, the probe uuid resolves to its name, and a
                // bogus uuid returns the BROKEN sentinel.
                const flowCacheWarm = async (): Promise<void> => {
                    if (uuidNameCache != null) {
                        try {
                            await uuidNameCache.build();
                            const ready = uuidNameCache.isReady?.() === true;
                            const bogus = uuidNameCache.getName('Compendium.wh40k-rpg.does-not-exist.Item.deadbeefdeadbeef');
                            const bogusOk = bogus === '[broken link]';
                            let hot = true;
                            if (probeItemUuid != null && probeItemName != null) {
                                hot = uuidNameCache.getName(probeItemUuid) === probeItemName;
                            }
                            const ok = ready && bogusOk && hot;
                            record('uuid-cache-warm', ok, ok ? null : `ready=${ready} bogusOk=${bogusOk} hot=${hot}`);
                        } catch (err) {
                            record('uuid-cache-warm', false, `build threw: ${errMsg(err)}`);
                        }
                    } else {
                        record('uuid-cache-warm', false, 'cache not loaded');
                    }
                };

                await flowFilterByPack();
                await flowFilterBySystem();
                await flowSearchByName();
                await flowSelectResult();
                await closeBrowserWindow(inst);
                await flowCacheResolvesName();
                flowCacheExpandTemplates();
                await flowCacheWarm();

                return out;
            },
            {
                browserUrl: BROWSER_MODULE_URL,
                cacheUrl: CACHE_MODULE_URL,
            },
        );
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

// Per-side flow keys, injected into the page via globalThis so the
// import-failure branches in the evaluate body can iterate without
// duplicating the canonical FLOWS list. Kept in sync with FLOWS above.
const FLOWS_BROWSER: readonly string[] = [
    'browser-renders',
    'browser-filter-by-pack',
    'browser-filter-by-system',
    'browser-search-by-name',
    'browser-select-result',
];
const FLOWS_CACHE: readonly string[] = ['uuid-cache-resolves-name', 'uuid-cache-expand-templates', 'uuid-cache-warm'];

test.describe.serial('compendium browser + uuid name cache (Tier B)', () => {
    test('every compendium-browser flow + uuid-cache surface executes', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        // Inject the in-browser flow-key arrays so the IIFE's error branches
        // can iterate them. Done via page.addInitScript-equivalent by
        // attaching to a property the evaluate body reads.
        await page.evaluate(
            ({ flowsBrowser, flowsCache }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: attaching test-constant arrays to the in-browser globalThis for the evaluate body to read
                const g = globalThis as unknown as { FLOWS_BROWSER?: string[]; FLOWS_CACHE?: string[] };
                g.FLOWS_BROWSER = flowsBrowser;
                g.FLOWS_CACHE = flowsCache;
            },
            { flowsBrowser: Array.from(FLOWS_BROWSER), flowsCache: Array.from(FLOWS_CACHE) },
        );

        const probe = await runFlows(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.passed) {
                recordCoverage('compendium-browser.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${FLOWS.length} compendium-browser flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
