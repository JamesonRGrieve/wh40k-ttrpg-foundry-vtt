import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { test } from './lib/test';

/**
 * Tier B coverage of the REAL Item Piles module driving the wh40k-rpg
 * integration — the half of the hybrid plan that needs the third-party module
 * actually installed + active (game.itempiles.API). It is SKIP-GATED and
 * READ-ONLY: it never mutates the shared world (no enabling modules at runtime,
 * see ensureItemPilesActive). It runs only when the world was launched with
 * Item Piles + socketlib + lib-wrapper all active and fully initialised; install
 * the cache with `scripts/install-e2e-itempiles.sh` (setup-foundry-test-world.sh
 * symlinks it in) and provision a world with the three enabled at boot. When
 * fully active it drives the real API — all verified against Item Piles 3.3.4:
 *
 *   - module-active-and-integrated: our integration applied
 *     (src/module/integrations/item-piles.ts → applyItemPilesReady) — the pile
 *     actor type seeded to `loot` (#402), which the gate also requires.
 *   - currency add / remove / transfer against the per-line wallet paths those
 *     currencies declare (system.throneGelt et al.) — multi-currency + trading.
 *   - item add + transfer between actors — trading physical items.
 *   - pile-flag-detected: an actor carrying the real item-piles enabled flag is
 *     recognised by OUR isItemPilesPile detector (and the module's own validity
 *     check when the public API exposes one).
 *
 * Flows record under `itempiles-module.flow`. Keys MUST match the
 * ITEM_PILES_MODULE_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const ITEM_PILES_MODULE_FLOWS = [
    'module-active-and-integrated',
    'currency-add-and-read',
    'currency-remove',
    'currency-transfer-between-actors',
    'item-add-and-read',
    'item-transfer-between-actors',
    'pile-flag-detected',
] as const;

type FlowName = (typeof ITEM_PILES_MODULE_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

/**
 * A module is only FULLY active (drivable) when its API object exists AND its
 * socket-dependent `ready` init completed — which for wh40k-rpg is observable as
 * our integration having applied: the pile actor type seeded to `loot` (#402,
 * done inside applyItemPilesReady on the item-piles-ready hook). Item Piles pulls
 * that (and its CURRENCIES, and socketlib's executeAsGM) up only once its socket
 * handlers register; if `item-piles-ready` never fires, API exists but every API
 * call fails. Gating on the seed distinguishes "loaded" from "usable".
 */
async function itemPilesFullyActive(page: Page): Promise<boolean> {
    return page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: third-party `game.itempiles` + Foundry `game.settings` are outside our type surface
        const g = globalThis as unknown as { game?: { itempiles?: { API?: unknown }; settings?: { get?: (s: string, k: string) => unknown } } };
        for (let i = 0; i < 60; i++) {
            const apiUp = g.game?.itempiles?.API != null;
            const seeded = g.game?.settings?.get?.('item-piles', 'actorClassType') === 'loot';
            // Our addSystemIntegration must have populated Item Piles' active
            // currencies (its parser reads them from this setting) — otherwise
            // every addCurrencies("5tg") throws "could not determine currencies".
            // Our throne-gelt abbreviation is "{#}tg", so the serialised setting
            // contains "tg" once registration lands.
            const currencies = g.game?.settings?.get?.('item-piles', 'currencies');
            const currenciesLive = currencies != null && JSON.stringify(currencies).includes('tg');
            if (apiUp && seeded && currenciesLive) return true;
            // eslint-disable-next-line no-await-in-loop -- polling for module ready-init after activation; bounded, sequential by design
            await new Promise((r) => {
                setTimeout(r, 250);
            });
        }
        return false;
    });
}

/**
 * Observe whether Item Piles (+ socketlib + lib-wrapper) are FULLY active in the
 * world AS LAUNCHED — WITHOUT mutating it. Returns 'absent' when the module isn't
 * installed (→ skip), 'inactive' when it is installed but not fully initialised
 * (→ skip, surfaced), or 'active' when the real API is live AND our integration
 * applied.
 *
 * This is deliberately read-only. An earlier version enabled the modules at
 * runtime (set core.moduleConfiguration + reload); that (a) persists into the
 * SHARED ephemeral world, so a half-activated Item Piles then throws "requires
 * libWrapper" page errors that break every OTHER spec sharing the world, and
 * (b) only half-activates anyway (item-piles loads but lib-wrapper/socketlib do
 * not co-activate, so item-piles-ready never fires). Full activation with all
 * deps co-active is therefore a world-PROVISIONING concern:
 * setup-foundry-test-world.sh runs scripts/seed-e2e-module-config.cjs, which
 * pre-seeds core.moduleConfiguration to enable the three at boot WHEN the module
 * cache (scripts/install-e2e-itempiles.sh) is installed. So this tier RUNS
 * whenever the cache is present, and skip-gates cleanly when it is not (default
 * CI) or when a headless boot doesn't fully initialise the module (e.g. its
 * currency parser — see itemPilesFullyActive, which waits for that too).
 */
async function ensureItemPilesActive(page: Page): Promise<'absent' | 'inactive' | 'active'> {
    const installed = await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.modules` collection is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game?: { modules?: { get?: (id: string) => unknown } } };
        return g.game?.modules?.get?.('item-piles') != null;
    });
    if (!installed) return 'absent';
    return (await itemPilesFullyActive(page)) ? 'active' : 'inactive';
}

async function probeRealModule(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            interface ActorRef {
                id?: string;
                uuid?: string;
                name?: string;
                items?: Iterable<{ id?: string; name?: string }>;
                setFlag?: (scope: string, key: string, value: object) => Promise<void>;
                delete?: () => Promise<void>;
            }
            interface ItemPilesApi {
                addCurrencies?: (target: ActorRef, currencies: string) => Promise<void>;
                removeCurrencies?: (target: ActorRef, currencies: string) => Promise<void>;
                transferCurrencies?: (source: ActorRef, target: ActorRef, currencies: string) => Promise<void>;
                addItems?: (target: ActorRef, items: object[]) => Promise<void>;
                transferItems?: (source: ActorRef, target: ActorRef, items: object[]) => Promise<void>;
                isValidItemPile?: (target: ActorRef) => boolean;
            }
            interface IntegrationModule {
                isItemPilesPile?: (actor: object) => boolean;
            }
            interface FoundryGlobal {
                Actor: { create: (data: { type: string; name: string; system?: Record<string, string> }) => Promise<ActorRef | undefined> };
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.getProperty resolves an arbitrary dot-path to an untyped value
                foundry: { utils: { getProperty: (obj: object, path: string) => unknown } };
                game: { itempiles?: { API?: ItemPilesApi }; settings?: { get?: (s: string, k: string) => string | undefined } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals + third-party module globals have no shipped types
            const g = globalThis as unknown as FoundryGlobal;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            const api = g.game.itempiles?.API;
            const trash: ActorRef[] = [];
            const mkActor = async (name: string): Promise<ActorRef | null> => {
                const actor = (await g.Actor.create({ name, type: 'dh1-character', system: { gameSystem: 'dh1' } })) ?? null;
                if (actor !== null) trash.push(actor);
                return actor;
            };
            const wallet = (a: ActorRef): number => {
                const v = g.foundry.utils.getProperty(a, 'system.throneGelt');
                return typeof v === 'number' ? v : Number.NaN;
            };
            const hasItem = (a: ActorRef, itemName: string): boolean => Array.from(a.items ?? []).some((i) => i.name === itemName);

            if (api === undefined) return out;

            // ── Our integration applied: pile actor type seeded to `loot` (#402) ────
            const runIntegrationFlow = (): void => {
                try {
                    const seeded = g.game.settings?.get?.('item-piles', 'actorClassType');
                    record('module-active-and-integrated', seeded === 'loot', seeded === 'loot' ? null : `actorClassType=${JSON.stringify(seeded)}`);
                } catch (err) {
                    record('module-active-and-integrated', false, String((err as Error).message));
                }
            };

            // ── Currency: add → read → remove → transfer (multi-currency + trading) ─
            const runCurrencyFlows = async (): Promise<void> => {
                const donor = await mkActor('IPM Donor');
                try {
                    if (donor === null || api.addCurrencies === undefined) throw new Error('setup/API unavailable');
                    await api.addCurrencies(donor, '5tg');
                    record('currency-add-and-read', wallet(donor) === 5, wallet(donor) === 5 ? null : `throneGelt=${String(wallet(donor))} after +5tg`);
                } catch (err) {
                    record('currency-add-and-read', false, String((err as Error).message));
                }
                try {
                    if (donor === null || api.removeCurrencies === undefined) throw new Error('setup/API unavailable');
                    await api.removeCurrencies(donor, '2tg');
                    record('currency-remove', wallet(donor) === 3, wallet(donor) === 3 ? null : `throneGelt=${String(wallet(donor))} after -2tg`);
                } catch (err) {
                    record('currency-remove', false, String((err as Error).message));
                }
                try {
                    const payee = await mkActor('IPM Payee');
                    if (donor === null || payee === null || api.transferCurrencies === undefined) throw new Error('setup/API unavailable');
                    const before = wallet(donor);
                    await api.transferCurrencies(donor, payee, '1tg');
                    const ok = wallet(payee) === 1 && wallet(donor) === before - 1;
                    record('currency-transfer-between-actors', ok, ok ? null : `donor=${String(wallet(donor))} payee=${String(wallet(payee))}`);
                } catch (err) {
                    record('currency-transfer-between-actors', false, String((err as Error).message));
                }
            };

            // ── Item: add → read → transfer between actors (trading items) ──────────
            const runItemFlows = async (): Promise<void> => {
                const holder = await mkActor('IPM Holder');
                try {
                    if (holder === null || api.addItems === undefined) throw new Error('setup/API unavailable');
                    await api.addItems(holder, [{ name: 'IPM Frag Grenade', type: 'weapon', system: { quantity: 2 } }]);
                    record('item-add-and-read', hasItem(holder, 'IPM Frag Grenade'), hasItem(holder, 'IPM Frag Grenade') ? null : 'item absent after addItems');
                } catch (err) {
                    record('item-add-and-read', false, String((err as Error).message));
                }
                try {
                    const recipient = await mkActor('IPM Recipient');
                    if (holder === null || recipient === null || api.transferItems === undefined) throw new Error('setup/API unavailable');
                    // transferItems matches items by their real _id on the source, not by a name projection.
                    const held = Array.from(holder.items ?? []).find((i) => i.name === 'IPM Frag Grenade');
                    if (held?.id == null) throw new Error('holder lacks the item to transfer (item-add must pass first)');
                    await api.transferItems(holder, recipient, [{ _id: held.id, quantity: 1 }]);
                    record(
                        'item-transfer-between-actors',
                        hasItem(recipient, 'IPM Frag Grenade'),
                        hasItem(recipient, 'IPM Frag Grenade') ? null : 'recipient lacks the transferred item',
                    );
                } catch (err) {
                    record('item-transfer-between-actors', false, String((err as Error).message));
                }
            };

            // ── Flag an actor with the real Item Piles enabled flag; OUR detector
            // (isItemPilesPile) must recognise it, and the module's own validity
            // check must agree when it exposes one (feature-detected). This asserts
            // our integration reads the module's ACTUAL flag shape, not a guess. ───
            const runPileFlagFlow = async (): Promise<void> => {
                try {
                    const pileActor = await mkActor('IPM Pile');
                    if (pileActor?.setFlag === undefined) throw new Error('actor.setFlag unavailable');
                    await pileActor.setFlag('item-piles', 'data', { enabled: true });
                    const integ = '/systems/wh40k-rpg/module/integrations/item-piles.js';
                    // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
                    const mod = (await import(/* @vite-ignore */ integ)) as IntegrationModule;
                    const oursSaysPile = mod.isItemPilesPile?.(pileActor) === true;
                    // Module-side validity is a bonus assertion only when the public API exposes it.
                    const moduleSaysPile = typeof api.isValidItemPile === 'function' ? api.isValidItemPile(pileActor) : true;
                    record(
                        'pile-flag-detected',
                        oursSaysPile && moduleSaysPile,
                        oursSaysPile && moduleSaysPile ? null : `ours=${String(oursSaysPile)} module=${String(moduleSaysPile)}`,
                    );
                } catch (err) {
                    record('pile-flag-detected', false, String((err as Error).message));
                }
            };

            try {
                runIntegrationFlow();
                await runCurrencyFlows();
                await runItemFlows();
                await runPileFlagFlow();
            } finally {
                for (const doc of trash) {
                    try {
                        // eslint-disable-next-line no-await-in-loop -- best-effort serial teardown; parallel deletes race Foundry's collection writes
                        await doc.delete?.();
                    } catch {
                        /* best-effort */
                    }
                }
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('Item Piles MODULE (Tier B, skip-gated)', () => {
    test('real game.itempiles.API drives currency + item transfer + pile detection', async ({ page }) => {
        await joinOrSkip(page);

        const state = await ensureItemPilesActive(page);
        test.skip(state === 'absent', 'Item Piles not installed — run scripts/install-e2e-itempiles.sh to enable this tier');
        test.skip(
            state === 'inactive',
            'Item Piles installed but did not complete its socket-dependent init headlessly (API object present, item-piles-ready never fired) — the real-module tier runs where the module fully initializes',
        );

        const probe = await probeRealModule(page);
        assertFlowResults(probe, ITEM_PILES_MODULE_FLOWS, { dimension: 'itempiles-module.flow', label: 'Item Piles module' });
    });
});
