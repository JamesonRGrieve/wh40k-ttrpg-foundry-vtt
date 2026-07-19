import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B "full gameplay" scenarios — each test drives a complete narrative
 * across MULTIPLE subsystems the way a session actually would, rather than one
 * feature in isolation. They tie together the real Documents + rules modules:
 *
 *   1. MULTI-PARTY COMBAT — two PCs + two NPCs in one live Combat: initiative
 *      across four combatants → turn order → a PC strikes with an equipped weapon
 *      (item use) → an NPC is dropped and takes CRITICAL damage whose side-effects
 *      (helmet torn off, a condition applied) fire through the real crit pipeline
 *      → a second PC kills the second NPC → the encounter ends.
 *   2. LOOTING — a fallen enemy's gear (a jammed weapon + a partial ammo stack)
 *      becomes a loot pile a survivor picks up, with per-item condition and ammo
 *      quantity preserved across the transfer.
 *   3. TRADING — two party members exchange currency and an item through the real
 *      Item Piles API (skip-gated: only runs where the module is fully active).
 *
 * Headless constraints (same as combat-full-encounter.spec.ts): the dialog-driven
 * attack ROLL can't run headless (it waits for a click), so the attack pipeline's
 * wiring is asserted while damage is applied deterministically via applyDamage;
 * combat methods are wrapped in withTimeout so a socket-waiting call can't hang
 * the server; Combat is scene-less. Browser errors are caught by the global guard
 * (lib/test.ts), so these probes carry no page-error plumbing of their own.
 */

interface StepResult {
    step: string;
    success: boolean;
    note: string;
}

/** Run a step-based scenario probe and assert every step passed. */
async function runScenario(page: Page, probe: (page: Page) => Promise<StepResult[]>, label: string): Promise<void> {
    const results = await probe(page);
    const failures = results.filter((r) => !r.success).map((r) => `${r.step}: ${r.note}`);
    const passed = results.length - failures.length;
    expect(failures, `${failures.length}/${results.length} ${label} steps failed (${passed} passed):\n  - ${failures.join('\n  - ')}`).toEqual([]);
}

/* ============================ Scenario 1: combat ============================ */

async function probeMultiPartyCombat(page: Page): Promise<StepResult[]> {
    return page.evaluate(async () => {
        interface WoundsState {
            value: number;
            max: number;
            critical: number;
        }
        interface ItemRef {
            id?: string;
            name?: string;
            system?: { state?: { equipped?: boolean } };
        }
        interface ActorDoc {
            id?: string;
            system?: { wounds?: WoundsState };
            items?: Iterable<ItemRef>;
            rollWeaponAttack?: (weaponId: string) => Promise<void>;
            applyDamage?: (amount: number, location: string, options: { ignoreArmour?: boolean; ignoreToughness?: boolean }) => Promise<void>;
            createEmbeddedDocuments?: (collection: string, data: object[]) => Promise<ItemRef[]>;
            delete?: () => Promise<void>;
        }
        interface CombatantDoc {
            id?: string;
        }
        interface CombatInstance {
            id?: string;
            round?: number;
            combatant?: { id?: string };
            createEmbeddedDocuments?: (type: string, data: Array<{ actorId: string }>) => Promise<CombatantDoc[]>;
            startCombat?: () => Promise<void>;
            nextTurn?: () => Promise<void>;
            setInitiative?: (combatantId: string, value: number) => Promise<void>;
            delete?: () => Promise<void>;
        }
        interface CriticalDamageRiders {
            helmetTornOff: boolean;
        }
        interface CritRecord {
            damageType: string;
            bodyPart: 'Head' | 'Body' | 'Arm' | 'Leg';
            severity: number;
            effect: string;
            riders: CriticalDamageRiders;
        }
        interface SideEffectReport {
            helmetTornOff: string | null;
            conditionsApplied: string[];
            hasSideEffects: boolean;
        }
        interface ActorSeed {
            gameSystem?: string;
            wounds?: WoundsState;
        }
        interface FoundryGlobal {
            Actor: { create: (data: { name: string; type: string; system?: ActorSeed }) => Promise<ActorDoc | null> };
            Combat: { create: (data: Record<string, never>) => Promise<CombatInstance | null> };
            game: { actors: { get: (id: string) => ActorDoc | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 runtime globals have no shipped types in this repo
        const g = globalThis as unknown as FoundryGlobal;

        const out: StepResult[] = [];
        const step = async (name: string, fn: () => string | Promise<string>): Promise<void> => {
            try {
                out.push({ step: name, success: true, note: await fn() });
            } catch (err) {
                out.push({ step: name, success: false, note: err instanceof Error ? err.message : String(err) });
            }
        };
        const withTimeout = async <T>(p: Promise<T> | undefined, ms: number, label: string): Promise<T> => {
            if (p === undefined) throw new Error(`${label} unavailable`);
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            });
            try {
                return await Promise.race([p, timeout]);
            } finally {
                clearTimeout(timer);
            }
        };
        const base = '/systems/wh40k-rpg/module';
        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
        const critMod = (await import(`${base}/rules/critical-damage.js`)) as {
            classifyCriticalEffect: (t: string) => CriticalDamageRiders;
            clampCriticalSeverity: (n: number) => number;
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
        const aeMod = (await import(`${base}/rules/active-effects.js`)) as {
            applyCriticalDamageConditions: (a: ActorDoc, r: CritRecord) => Promise<SideEffectReport>;
        };
        const live = (id: string): ActorDoc | undefined => g.game.actors.get(id);
        const WOUNDS = 6;
        const DMG = 2;

        const ids = { pc1: '', pc2: '', npc1: '', npc2: '', weapon: '' };
        let combat: CombatInstance | null = null;
        const cmb = { pc1: '', pc2: '', npc1: '', npc2: '' };
        // Read the closure-assigned combat without CFA narrowing it in the finally
        // scope (assignments happen inside async step callbacks).
        const currentCombat = (): CombatInstance | null => combat;

        try {
            await step('assemble-party', async () => {
                const mk = async (name: string, type: string, system: ActorSeed): Promise<ActorDoc> => {
                    const a = await withTimeout(g.Actor.create({ name, type, system }), 5_000, `create ${name}`);
                    if (a?.id == null) throw new Error(`create ${name} returned null`);
                    return a;
                };
                const pc1 = await mk('Scenario PC Bjorn', 'dh2-character', { gameSystem: 'dh2' });
                const pc2 = await mk('Scenario PC Yrsa', 'dh2-character', { gameSystem: 'dh2' });
                const npc1 = await mk('Scenario Cultist A', 'dh2-npc', { gameSystem: 'dh2', wounds: { max: WOUNDS, value: WOUNDS, critical: 0 } });
                const npc2 = await mk('Scenario Cultist B', 'dh2-npc', { gameSystem: 'dh2', wounds: { max: WOUNDS, value: WOUNDS, critical: 0 } });
                ids.pc1 = pc1.id ?? '';
                ids.pc2 = pc2.id ?? '';
                ids.npc1 = npc1.id ?? '';
                ids.npc2 = npc2.id ?? '';
                // PC1 wields a chainsword (item use); NPC1 wears a head coif (for the crit helmet side-effect).
                const madeWeapon = await pc1.createEmbeddedDocuments?.('Item', [
                    { name: 'Scenario Chainsword', type: 'weapon', system: { class: 'melee', equipped: true, damage: { formula: '1d10', type: 'rending' } } },
                ]);
                ids.weapon = madeWeapon?.[0]?.id ?? '';
                await npc1.createEmbeddedDocuments?.('Item', [
                    { name: 'Scenario Coif', type: 'armour', system: { coverage: ['head'], state: { equipped: true } } },
                ]);
                return `2 PCs + 2 NPCs (${WOUNDS} wounds each); PC1 armed, NPC1 helmeted`;
            });

            await step('item-use-wired', () => {
                const pc1 = live(ids.pc1);
                if (typeof pc1?.rollWeaponAttack !== 'function') throw new Error('PC1.rollWeaponAttack is not a function');
                if (ids.weapon === '') throw new Error('PC1 has no equipped weapon');
                return 'PC1 exposes rollWeaponAttack for its equipped weapon (dialog roll itself is out of scope headless)';
            });

            await step('start-encounter', async () => {
                const c = await withTimeout(g.Combat.create({}), 5_000, 'Combat.create');
                if (c?.id == null) throw new Error('Combat.create returned null');
                combat = c;
                const created = await withTimeout(
                    c.createEmbeddedDocuments?.('Combatant', [{ actorId: ids.pc1 }, { actorId: ids.pc2 }, { actorId: ids.npc1 }, { actorId: ids.npc2 }]),
                    5_000,
                    'add combatants',
                );
                const cids = created.map((d) => d.id).filter((id): id is string => typeof id === 'string');
                if (cids.length < 4) throw new Error(`expected 4 combatants, got ${cids.length}`);
                [cmb.pc1, cmb.pc2, cmb.npc1, cmb.npc2] = cids;
                await withTimeout(c.setInitiative?.(cmb.pc1, 40), 5_000, 'init pc1');
                await withTimeout(c.setInitiative?.(cmb.pc2, 30), 5_000, 'init pc2');
                await withTimeout(c.setInitiative?.(cmb.npc1, 20), 5_000, 'init npc1');
                await withTimeout(c.setInitiative?.(cmb.npc2, 10), 5_000, 'init npc2');
                await withTimeout(c.startCombat?.(), 5_000, 'startCombat');
                if ((c.round ?? 0) < 1) throw new Error(`expected round >= 1, got ${c.round ?? 0}`);
                if (c.combatant?.id !== cmb.pc1) throw new Error(`expected PC1 (init 40) first, got ${c.combatant?.id ?? 'undefined'}`);
                return `4-combatant encounter live; PC1 acts first at round ${c.round ?? 0}`;
            });

            await step('pc1-strikes-cultist-a', async () => {
                const npc1 = live(ids.npc1);
                await withTimeout(npc1?.applyDamage?.(DMG, 'body', { ignoreArmour: true, ignoreToughness: true }), 5_000, 'PC1 strike');
                const w = live(ids.npc1)?.system?.wounds?.value ?? -1;
                if (w !== WOUNDS - DMG) throw new Error(`expected ${WOUNDS - DMG} wounds, got ${w}`);
                return `PC1's chainsword bites: Cultist A ${WOUNDS} → ${w}`;
            });

            await step('turn-order-around-the-table', async () => {
                const c = combat;
                if (c == null) throw new Error('combat missing');
                // Fresh read each time — a plain `c.combatant?.id` would be CFA-narrowed
                // to the previous turn's value even though nextTurn() changed it.
                const curId = (): string | undefined => c.combatant?.id;
                await withTimeout(c.nextTurn?.(), 5_000, 'to pc2');
                if (curId() !== cmb.pc2) throw new Error(`expected PC2 turn, got ${curId() ?? 'undefined'}`);
                await withTimeout(c.nextTurn?.(), 5_000, 'to npc1');
                if (curId() !== cmb.npc1) throw new Error(`expected Cultist A turn, got ${curId() ?? 'undefined'}`);
                await withTimeout(c.nextTurn?.(), 5_000, 'to npc2');
                await withTimeout(c.nextTurn?.(), 5_000, 'wrap to round 2');
                if ((c.round ?? 0) < 2) throw new Error(`expected round >= 2 after a full go-around, got ${c.round ?? 0}`);
                return `turn order held across all 4 combatants; now round ${c.round ?? 0}`;
            });

            await step('cultist-a-dropped-and-critically-hit', async () => {
                // Two more strikes drop Cultist A to 0 and accrue critical wounds.
                const npc1 = live(ids.npc1);
                await withTimeout(npc1?.applyDamage?.(DMG, 'body', { ignoreArmour: true, ignoreToughness: true }), 5_000, 'strike 2');
                await withTimeout(live(ids.npc1)?.applyDamage?.(DMG, 'body', { ignoreArmour: true, ignoreToughness: true }), 5_000, 'killing blow');
                const dead = live(ids.npc1);
                if ((dead?.system?.wounds?.value ?? -1) !== 0) throw new Error(`expected 0 wounds, got ${dead?.system?.wounds?.value ?? -1}`);
                // The killing blow is a head-splitting critical: run the real crit pipeline.
                const effect = 'A brutal overhead blow splits the skull — his helmet is torn off and he catches fire, burning.';
                const rec: CritRecord = {
                    damageType: 'Energy',
                    bodyPart: 'Head',
                    severity: critMod.clampCriticalSeverity(6),
                    effect,
                    riders: critMod.classifyCriticalEffect(effect),
                };
                const report = await withTimeout(aeMod.applyCriticalDamageConditions(dead as ActorDoc, rec), 5_000, 'applyCriticalDamageConditions');
                const coif = Array.from(live(ids.npc1)?.items ?? []).find((i) => i.name === 'Scenario Coif');
                if (report.helmetTornOff !== 'Scenario Coif') throw new Error(`expected helmet 'Scenario Coif' torn off, got ${String(report.helmetTornOff)}`);
                if (coif?.system?.state?.equipped !== false) throw new Error('expected the coif to be unequipped after the crit');
                if (!report.hasSideEffects || report.conditionsApplied.length === 0)
                    throw new Error(`expected crit conditions applied, got ${JSON.stringify(report.conditionsApplied)}`);
                return `critical: helmet torn off, conditions applied [${report.conditionsApplied.join(', ')}]`;
            });

            await step('pc2-finishes-cultist-b', async () => {
                for (let i = 0; i < 3; i++) {
                    // eslint-disable-next-line no-await-in-loop -- sequential strikes deplete the same live actor; each must resolve before the next reads wounds
                    await withTimeout(live(ids.npc2)?.applyDamage?.(DMG, 'body', { ignoreArmour: true, ignoreToughness: true }), 5_000, `pc2 strike ${i + 1}`);
                }
                const dead = live(ids.npc2);
                if ((dead?.system?.wounds?.value ?? -1) !== 0) throw new Error(`expected Cultist B at 0 wounds, got ${dead?.system?.wounds?.value ?? -1}`);
                if ((dead?.system?.wounds?.critical ?? 0) <= 0) throw new Error('expected critical wounds > 0 at death');
                return `PC2 fells Cultist B: wounds 0, critical ${dead?.system?.wounds?.critical ?? 0}`;
            });

            await step('encounter-ends', async () => {
                // endCombat opens a confirm dialog that hangs headless; delete directly (as combat-full-encounter does).
                await withTimeout(currentCombat()?.delete?.(), 5_000, 'end encounter');
                return 'both cultists down; the encounter ends';
            });
        } finally {
            try {
                await currentCombat()?.delete?.();
            } catch {
                /* ignore */
            }
            for (const id of [ids.pc1, ids.pc2, ids.npc1, ids.npc2]) {
                try {
                    // eslint-disable-next-line no-await-in-loop -- best-effort serial teardown; parallel deletes race Foundry collection writes
                    await live(id)?.delete?.();
                } catch {
                    /* ignore */
                }
            }
        }
        return out;
    });
}

/* ============================ Scenario 2: looting =========================== */

async function probeLooting(page: Page): Promise<StepResult[]> {
    return page.evaluate(async () => {
        interface ItemRef {
            id?: string;
            name?: string;
            type?: string;
            system?: { quantity?: number; jammed?: boolean };
        }
        interface ActorDoc {
            id?: string;
            items?: Iterable<ItemRef>;
            createEmbeddedDocuments?: (collection: string, data: ItemRef[]) => Promise<ItemRef[]>;
            delete?: () => Promise<void>;
        }
        interface FoundryGlobal {
            Actor: { create: (data: { name: string; type: string; system?: { gameSystem?: string } }) => Promise<ActorDoc | null> };
            game: { actors: { get: (id: string) => ActorDoc | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 runtime globals have no shipped types in this repo
        const g = globalThis as unknown as FoundryGlobal;
        const out: StepResult[] = [];
        const step = async (name: string, fn: () => string | Promise<string>): Promise<void> => {
            try {
                out.push({ step: name, success: true, note: await fn() });
            } catch (err) {
                out.push({ step: name, success: false, note: err instanceof Error ? err.message : String(err) });
            }
        };
        // Indirect specifier so TS/knip don't try to resolve the browser runtime URL.
        const mgrUrl = '/systems/wh40k-rpg/module/managers/item-drop-manager.js';
        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
        const mgr = (await import(mgrUrl)) as {
            ItemDropManager: { pickupLoot: (receiver: ActorDoc, pile: ActorDoc) => Promise<boolean> };
        };
        const trash: ActorDoc[] = [];
        const items = (a: ActorDoc | undefined): ItemRef[] => Array.from((a?.id != null ? g.game.actors.get(a.id) : a)?.items ?? []);

        try {
            let survivor: ActorDoc | null = null;
            let pile: ActorDoc | null = null;
            await step('survivor-finds-the-fallen', async () => {
                const s = await g.Actor.create({ name: 'Scenario Survivor', type: 'dh2-character', system: { gameSystem: 'dh2' } });
                if (s?.id == null) throw new Error('survivor create failed');
                survivor = s;
                trash.push(s);
                // The fallen enemy's gear becomes a loot pile: a jammed autogun + a partial clip.
                const p = await g.Actor.create({ name: "Scenario Fallen's Gear", type: 'loot' });
                if (p?.id == null || p.createEmbeddedDocuments == null) throw new Error('loot pile create failed');
                pile = p;
                trash.push(p);
                await p.createEmbeddedDocuments('Item', [
                    { name: 'Scenario Autogun', type: 'weapon', system: { jammed: true, quantity: 1 } },
                    { name: 'Scenario Clip', type: 'ammunition', system: { quantity: 12 } },
                ]);
                return 'a jammed autogun + a 12-round clip lie on the fallen enemy';
            });

            await step('loot-the-body', async () => {
                if (survivor === null || pile === null) throw new Error('setup failed');
                const ok = await mgr.ItemDropManager.pickupLoot(survivor, pile);
                if (!ok) throw new Error('pickupLoot returned false');
                return 'survivor loots the body';
            });

            await step('gear-arrives-intact', () => {
                if (survivor === null) throw new Error('setup failed');
                const gun = items(survivor).find((i) => i.name === 'Scenario Autogun');
                const clip = items(survivor).find((i) => i.name === 'Scenario Clip');
                if (gun?.system?.jammed !== true) throw new Error(`expected the autogun's jam to survive, got jammed=${String(gun?.system?.jammed)}`);
                if (clip?.system?.quantity !== 12) throw new Error(`expected the clip's 12 rounds to survive, got ${String(clip?.system?.quantity)}`);
                return 'looted gear preserved: autogun still jammed, clip still 12 rounds';
            });
        } finally {
            for (const a of trash) {
                try {
                    // eslint-disable-next-line no-await-in-loop -- best-effort serial teardown; parallel deletes race Foundry collection writes
                    await g.game.actors.get(a.id ?? '')?.delete?.();
                } catch {
                    /* ignore */
                }
            }
        }
        return out;
    });
}

/* ============================ Scenario 3: trading ========================== */

/** Item Piles is only usable when its API is live AND our integration applied
 *  (pile actor type seeded) — matching item-piles-module.spec.ts's gate. */
async function itemPilesReady(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: third-party game.itempiles + Foundry game.settings are outside our type surface
        const g = globalThis as unknown as { game?: { itempiles?: { API?: unknown }; settings?: { get?: (s: string, k: string) => unknown } } };
        return g.game?.itempiles?.API != null && g.game.settings?.get?.('item-piles', 'actorClassType') === 'loot';
    });
}

async function probeTrading(page: Page): Promise<StepResult[]> {
    return page.evaluate(async () => {
        interface ItemRef {
            id?: string;
            name?: string;
        }
        interface ActorDoc {
            id?: string;
            items?: Iterable<ItemRef>;
            delete?: () => Promise<void>;
        }
        interface ItemPilesApi {
            addCurrencies?: (t: ActorDoc, c: string) => Promise<void>;
            transferCurrencies?: (s: ActorDoc, t: ActorDoc, c: string) => Promise<void>;
            addItems?: (t: ActorDoc, items: object[]) => Promise<void>;
            transferItems?: (s: ActorDoc, t: ActorDoc, items: object[]) => Promise<void>;
        }
        interface FoundryGlobal {
            Actor: { create: (data: { name: string; type: string; system?: Record<string, string> }) => Promise<ActorDoc | null> };
            game: { actors: { get: (id: string) => ActorDoc | undefined }; itempiles?: { API?: ItemPilesApi } };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry foundry.utils.getProperty resolves an arbitrary dot-path to an untyped value
            foundry: { utils: { getProperty: (obj: object, path: string) => unknown } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 runtime globals have no shipped types in this repo
        const g = globalThis as unknown as FoundryGlobal;
        const api = g.game.itempiles?.API;
        const out: StepResult[] = [];
        const step = async (name: string, fn: () => string | Promise<string>): Promise<void> => {
            try {
                out.push({ step: name, success: true, note: await fn() });
            } catch (err) {
                out.push({ step: name, success: false, note: err instanceof Error ? err.message : String(err) });
            }
        };
        const trash: ActorDoc[] = [];
        const purse = (a: ActorDoc): number => {
            const v = g.foundry.utils.getProperty(a, 'system.throneGelt');
            return typeof v === 'number' ? v : Number.NaN;
        };
        const has = (a: ActorDoc, name: string): boolean => Array.from((a.id != null ? g.game.actors.get(a.id) : a)?.items ?? []).some((i) => i.name === name);

        try {
            let buyer: ActorDoc | null = null;
            let seller: ActorDoc | null = null;
            await step('two-acolytes-meet', async () => {
                if (api?.addCurrencies === undefined || api.addItems === undefined) throw new Error('Item Piles API unavailable');
                const b = await g.Actor.create({ name: 'Scenario Buyer', type: 'dh1-character', system: { gameSystem: 'dh1' } });
                const s = await g.Actor.create({ name: 'Scenario Seller', type: 'dh1-character', system: { gameSystem: 'dh1' } });
                if (b?.id == null || s?.id == null) throw new Error('actor create failed');
                buyer = b;
                seller = s;
                trash.push(b, s);
                await api.addCurrencies(s, '10tg'); // the seller has 10 thrones and a relic to trade
                await api.addItems(s, [{ name: 'Scenario Relic Blade', type: 'weapon', system: { quantity: 1 } }]);
                if (purse(g.game.actors.get(s.id) ?? s) !== 10) throw new Error(`seller should hold 10 tg, has ${purse(g.game.actors.get(s.id) ?? s)}`);
                return 'seller holds 10 thrones and a relic blade';
            });

            await step('coin-changes-hands', async () => {
                if (buyer === null || seller === null || api?.transferCurrencies === undefined) throw new Error('setup/API unavailable');
                await api.transferCurrencies(seller, buyer, '4tg');
                const sAfter = purse(g.game.actors.get(seller.id ?? '') ?? seller);
                const bAfter = purse(g.game.actors.get(buyer.id ?? '') ?? buyer);
                if (bAfter !== 4 || sAfter !== 6) throw new Error(`expected buyer 4 / seller 6, got buyer ${bAfter} / seller ${sAfter}`);
                return 'seller pays 4 thrones to the buyer (buyer 4, seller 6)';
            });

            await step('relic-changes-hands', async () => {
                if (buyer === null || seller === null || api?.transferItems === undefined) throw new Error('setup/API unavailable');
                const relic = Array.from((seller.id != null ? g.game.actors.get(seller.id) : seller)?.items ?? []).find(
                    (i) => i.name === 'Scenario Relic Blade',
                );
                if (relic?.id == null) throw new Error('seller lacks the relic to trade');
                await api.transferItems(seller, buyer, [{ _id: relic.id, quantity: 1 }]);
                if (!has(buyer, 'Scenario Relic Blade')) throw new Error('buyer did not receive the relic blade');
                return 'the relic blade passes to the buyer';
            });
        } finally {
            for (const a of trash) {
                try {
                    // eslint-disable-next-line no-await-in-loop -- best-effort serial teardown; parallel deletes race Foundry collection writes
                    await g.game.actors.get(a.id ?? '')?.delete?.();
                } catch {
                    /* ignore */
                }
            }
        }
        return out;
    });
}

/* ================================ tests ==================================== */

test.describe.serial('gameplay scenarios (Tier B)', () => {
    test.setTimeout(180_000);

    test('multi-party combat: initiative → item-use strike → critical side-effects → deaths', async ({ page }) => {
        await joinOrSkip(page);
        await runScenario(page, probeMultiPartyCombat, 'multi-party combat');
    });

    test('looting: a survivor loots a fallen enemy with weapon condition + ammo preserved', async ({ page }) => {
        await joinOrSkip(page);
        await runScenario(page, probeLooting, 'looting');
    });

    test('trading: two acolytes exchange thrones and a relic via Item Piles', async ({ page }) => {
        await joinOrSkip(page);
        const ready = await itemPilesReady(page);
        test.skip(!ready, 'Item Piles not fully active — trading scenario needs the module (see item-piles-module.spec.ts)');
        await runScenario(page, probeTrading, 'trading');
    });
});
