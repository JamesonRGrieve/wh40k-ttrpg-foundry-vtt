import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { test } from './lib/test';

/**
 * Tier B coverage of the wh40k-rpg ↔ Item Piles integration surface that only a
 * real Foundry runtime can exercise (the pure logic — payload build, drop
 * routing, pile detection, seeding, stack-merge planning — is already unit-
 * tested in src/module/integrations/item-piles.test.ts and
 * src/module/managers/item-drop-manager.test.ts; this spec deliberately does NOT
 * re-stub that). It validates against the REAL loaded config + REAL Documents:
 *
 *   - src/module/config.ts            (WH40K.currencies — the 6-currency registry
 *                                       Item Piles consumes as its CURRENCIES)
 *   - src/module/integrations/item-piles.ts (the wallet paths those currencies
 *                                       declare must resolve on real per-line actors)
 *   - src/module/managers/item-drop-manager.ts (pickupLoot: the live pile→actor
 *                                       transfer that must preserve ammo quantity
 *                                       and per-item condition, and stack-merge)
 *
 * The DROP half (ItemDropManager.dropItemFromActor) needs a rendered WebGL
 * canvas + a placed token (same constraint loot.spec.ts documents), so the
 * round-trip is exercised through hand-built `loot` piles + pickupLoot — where
 * the data-preservation actually happens (createEmbeddedDocuments of the pile
 * item's full toObject(), quantity-bump on merge).
 *
 * The REAL Item Piles MODULE (trade / merchant / currency transfer via
 * game.itempiles.API) is exercised by the skip-gated item-piles-module.spec.ts.
 *
 * Each flow records under `itempiles.flow`. Keys MUST match the ITEM_PILES_FLOWS
 * constant in scripts/e2e-coverage.mjs.
 */

const ITEM_PILES_FLOWS = [
    'currency-registry-complete',
    'currency-wallet-throne',
    'currency-wallet-influence',
    'currency-wallet-profitFactor',
    'currency-wallet-requisition',
    'currency-wallet-infamy',
    'currency-wallet-logistics',
    'pickup-preserves-ammo-quantity',
    'pickup-preserves-weapon-condition',
    'pickup-merges-into-existing-stack',
    'pickup-empty-pile-rejected',
] as const;

type FlowName = (typeof ITEM_PILES_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

/** The per-currency wallet flow keys, paired with the WH40K.currencies key. */
const CURRENCY_WALLET_FLOWS: Record<string, FlowName> = {
    throne: 'currency-wallet-throne',
    influence: 'currency-wallet-influence',
    profitFactor: 'currency-wallet-profitFactor',
    requisition: 'currency-wallet-requisition',
    infamy: 'currency-wallet-infamy',
    logistics: 'currency-wallet-logistics',
};

async function probeItemPiles(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (currencyWalletFlows): Promise<FlowResult[]> => {
            interface CurrencyConfig {
                walletPath: string;
                line: string;
                primary?: boolean;
            }
            interface ConfigModule {
                WH40K?: { currencies?: Record<string, CurrencyConfig | undefined> };
            }
            interface ItemRef {
                _id?: string;
                name?: string;
                type?: string;
                system?: { quantity?: number; jammed?: boolean };
            }
            interface ActorRef {
                id?: string;
                name?: string;
                items?: Iterable<ItemRef>;
                update?: (data: Record<string, number>) => Promise<void>;
                createEmbeddedDocuments?: (collection: string, data: ItemRef[]) => Promise<ItemRef[]>;
                delete?: () => Promise<void>;
            }
            interface ActorCls {
                create: (data: { type: string; name: string; system?: Record<string, string> }) => Promise<ActorRef | undefined>;
            }
            interface ManagerModule {
                ItemDropManager: { pickupLoot: (receiver: ActorRef, pile: ActorRef) => Promise<boolean> };
            }
            interface FoundryGlobal {
                Actor: ActorCls;
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.getProperty resolves an arbitrary dot-path to an untyped value (compared to a literal below)
                foundry: { utils: { getProperty: (obj: object, path: string) => unknown } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals + system-served ESM have no shipped types at this layer
            const g = globalThis as unknown as FoundryGlobal;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            const trash: ActorRef[] = [];
            const track = <T extends ActorRef | null>(actor: T): T => {
                if (actor !== null) trash.push(actor);
                return actor;
            };

            // Indirect the system-served ESM URLs so knip treats them as dynamic.
            const cfgUrl = '/systems/wh40k-rpg/module/config.js';
            const mgrUrl = '/systems/wh40k-rpg/module/managers/item-drop-manager.js';
            // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
            const cfgMod = (await import(/* @vite-ignore */ cfgUrl)) as ConfigModule;
            // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
            const mgrMod = (await import(/* @vite-ignore */ mgrUrl)) as ManagerModule;
            const currencies = cfgMod.WH40K?.currencies;
            const pickupLoot = mgrMod.ItemDropManager.pickupLoot;

            const makePile = async (name: string, items: ItemRef[]): Promise<ActorRef | null> => {
                const pile = await g.Actor.create({ name, type: 'loot' });
                if (pile?.id == null || pile.createEmbeddedDocuments == null) return null;
                track(pile);
                if (items.length > 0) await pile.createEmbeddedDocuments('Item', items);
                return pile;
            };
            const makeActor = async (name: string, items: ItemRef[]): Promise<ActorRef | null> => {
                const actor = await g.Actor.create({ name, type: 'dh2-character', system: { gameSystem: 'dh2' } });
                if (actor?.id == null) return null;
                track(actor);
                if (items.length > 0 && actor.createEmbeddedDocuments != null) await actor.createEmbeddedDocuments('Item', items);
                return actor;
            };
            const findItem = (actor: ActorRef | null, itemName: string): ItemRef | undefined => {
                if (actor?.items == null) return undefined;
                return Array.from(actor.items).find((i) => i.name === itemName);
            };

            // ── The 6-currency registry Item Piles consumes as CURRENCIES ──────────
            const runRegistryFlow = (): void => {
                try {
                    const expected = Object.keys(currencyWalletFlows);
                    if (currencies === undefined) throw new Error('WH40K.currencies unavailable');
                    const keys = Object.keys(currencies);
                    const hasAll = expected.every((k) => keys.includes(k));
                    const primaries = expected.filter((k) => currencies[k]?.primary === true);
                    const allHaveWallets = expected.every((k) => {
                        const p = currencies[k]?.walletPath;
                        return typeof p === 'string' && p.length > 0;
                    });
                    const ok = hasAll && primaries.length === 1 && primaries[0] === 'throne' && allHaveWallets;
                    record(
                        'currency-registry-complete',
                        ok,
                        ok ? null : `keys=${keys.join(',')} primaries=${primaries.join(',')} wallets=${String(allHaveWallets)}`,
                    );
                } catch (err) {
                    record('currency-registry-complete', false, String((err as Error).message));
                }
            };

            // ── Each currency's wallet path resolves + is writable on a real actor
            // of that currency's game line (a dead path silently no-ops transfers) ──
            const runWalletFlow = async (key: string, flow: FlowName): Promise<void> => {
                try {
                    const currency = currencies?.[key];
                    if (currency === undefined) {
                        record(flow, false, `currency ${key} missing from registry`);
                        return;
                    }
                    const actor = track(
                        (await g.Actor.create({ name: `ip-wallet-${key}`, type: `${currency.line}-character`, system: { gameSystem: currency.line } })) ?? null,
                    );
                    if (actor?.id == null) {
                        record(flow, false, `actor create failed for line ${currency.line}`);
                        return;
                    }
                    await actor.update?.({ [currency.walletPath]: 7 });
                    const readBack = g.foundry.utils.getProperty(actor, currency.walletPath);
                    record(flow, readBack === 7, readBack === 7 ? null : `path ${currency.walletPath} readBack=${JSON.stringify(readBack)}`);
                } catch (err) {
                    record(flow, false, String((err as Error).message));
                }
            };

            // ── pickupLoot preserves ammo quantity (creates path: full toObject) ────
            const runAmmoFlow = async (): Promise<void> => {
                try {
                    const pile = await makePile('IP Ammo Pile', [{ name: 'IP Bolt Rounds', type: 'ammunition', system: { quantity: 7 } }]);
                    const receiver = await makeActor('IP Ammo Receiver', []);
                    if (pile === null || receiver === null) throw new Error('setup failed');
                    const ok = await pickupLoot(receiver, pile);
                    const qty = findItem(receiver, 'IP Bolt Rounds')?.system?.quantity;
                    record('pickup-preserves-ammo-quantity', ok && qty === 7, ok && qty === 7 ? null : `pickup=${String(ok)} qty=${String(qty)}`);
                } catch (err) {
                    record('pickup-preserves-ammo-quantity', false, String((err as Error).message));
                }
            };

            // ── pickupLoot preserves a per-item condition (weapon jam, which #411
            // persists as state travelling with the item) ──────────────────────────
            const runConditionFlow = async (): Promise<void> => {
                try {
                    const pile = await makePile('IP Weapon Pile', [{ name: 'IP Jammed Autogun', type: 'weapon', system: { jammed: true, quantity: 1 } }]);
                    const receiver = await makeActor('IP Weapon Receiver', []);
                    if (pile === null || receiver === null) throw new Error('setup failed');
                    const ok = await pickupLoot(receiver, pile);
                    const jammed = findItem(receiver, 'IP Jammed Autogun')?.system?.jammed;
                    record(
                        'pickup-preserves-weapon-condition',
                        ok && jammed === true,
                        ok && jammed === true ? null : `pickup=${String(ok)} jammed=${String(jammed)}`,
                    );
                } catch (err) {
                    record('pickup-preserves-weapon-condition', false, String((err as Error).message));
                }
            };

            // ── pickupLoot merges same name+type stackable into the existing
            // receiver stack (updates path: live quantity math) ────────────────────
            const runMergeFlow = async (): Promise<void> => {
                try {
                    const receiver = await makeActor('IP Merge Receiver', [{ name: 'IP Stub Rounds', type: 'ammunition', system: { quantity: 3 } }]);
                    const pile = await makePile('IP Merge Pile', [{ name: 'IP Stub Rounds', type: 'ammunition', system: { quantity: 7 } }]);
                    if (pile === null || receiver === null) throw new Error('setup failed');
                    const ok = await pickupLoot(receiver, pile);
                    const stacks = receiver.items === undefined ? [] : Array.from(receiver.items).filter((i) => i.name === 'IP Stub Rounds');
                    const merged = stacks.length === 1 && stacks[0]?.system?.quantity === 10;
                    record(
                        'pickup-merges-into-existing-stack',
                        ok && merged,
                        ok && merged ? null : `pickup=${String(ok)} stacks=${stacks.length} qty=${String(stacks[0]?.system?.quantity)}`,
                    );
                } catch (err) {
                    record('pickup-merges-into-existing-stack', false, String((err as Error).message));
                }
            };

            // ── pickupLoot of an empty pile is rejected (no phantom transfer) ───────
            const runEmptyFlow = async (): Promise<void> => {
                try {
                    const pile = await makePile('IP Empty Pile', []);
                    const receiver = await makeActor('IP Empty Receiver', []);
                    if (pile === null || receiver === null) throw new Error('setup failed');
                    const ok = await pickupLoot(receiver, pile);
                    record('pickup-empty-pile-rejected', !ok, ok ? `pickup returned true for an empty pile` : null);
                } catch (err) {
                    record('pickup-empty-pile-rejected', false, String((err as Error).message));
                }
            };

            try {
                runRegistryFlow();
                for (const [key, flow] of Object.entries(currencyWalletFlows)) {
                    // eslint-disable-next-line no-await-in-loop -- sequential: each currency needs its own line-typed actor created + updated before the next
                    await runWalletFlow(key, flow);
                }
                await runAmmoFlow();
                await runConditionFlow();
                await runMergeFlow();
                await runEmptyFlow();
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
        }, CURRENCY_WALLET_FLOWS);
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('Item Piles integration (Tier B)', () => {
    test('currency registry + wallet paths + pickup preservation against real Documents', async ({ page }) => {
        await joinOrSkip(page);

        const probe = await probeItemPiles(page);
        assertFlowResults(probe, ITEM_PILES_FLOWS, { dimension: 'itempiles.flow', label: 'Item Piles' });
    });
});
