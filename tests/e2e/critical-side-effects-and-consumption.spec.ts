import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Critical Damage **side-effect state machine** and
 * carried-munition detonation, plus item-pile (loot) consumable transfer
 * integrity. Driven against the real seeded world through Foundry's deployed
 * runtime, exercising:
 *   - src/module/rules/active-effects.ts  (applyCriticalDamageConditions — the
 *       physical side-effect appliers: helmet torn off, held weapon dropped /
 *       destroyed, carried munitions cooking off, armour decision-tree gates)
 *   - src/module/rules/critical-damage.ts (classifyCriticalEffect — the
 *       content-agnostic prose → rider classifier that drives which appliers fire)
 *   - src/templates/chat/assign-damage-chat.hbs (the "Critical Side Effects"
 *       readout block on the assign-damage card)
 *   - src/module/managers/item-drop-manager.ts (loot pickup transfer + the pure
 *       planStackMerge stack-consumption planner) for consumable items
 *
 * WHY the crit records are hand-built from crafted effect prose rather than
 * resolved via `getCriticalDamageRecord`: the GW-copyrighted critical-injury
 * pack may be absent from the seed world, in which case that lookup degrades to
 * `effect: ''` / empty riders and NOTHING would fire. Feeding crafted prose
 * through the real `classifyCriticalEffect` keeps the test deterministic AND
 * still exercises the classifier end-to-end (crafted text → real riders →
 * real appliers → real document mutations), which is the pairing the task cares
 * about. Actors are `dh2-character` (PCs) on purpose: NPC weapons force-derive
 * `state.equipped = true` on every prepare (weapon.ts), which would mask the
 * unequip the appliers perform; on a PC `state.equipped` is authoritative.
 *
 * MUNITION CONSUMPTION: `detonateCarriedMunitions` rolls each grenade's own
 * secondary damage, surfaces the blast for the GM to distribute (blast
 * distribution to nearby tokens needs positions the damage path lacks), AND
 * expends the detonated munitions — zeroing their carried quantity and flagging
 * them `consumed`. The munitions flow asserts the detonation is surfaced (each
 * munition listed, grenade with a rolled number, loose ammunition with
 * `damage: null`) and that the carried quantities are expended to 0.
 *
 * ITEM-PILE CONSUMPTION FINDING: loot pickup IS a supported flow (mirrors
 * loot.spec.ts) — `ItemDropManager.pickupLoot` transfers embedded consumables
 * between real actors and deletes the emptied pile, and `planStackMerge` plans
 * quantity merges for stackable consumables. This spec adds a case asserting
 * that transfer integrity for grenades/ammunition (both consumables) and the
 * stack-merge quantity math.
 *
 * License gating: identical to the sibling Tier B specs. When `.foundry-release/`
 * is absent the config (`playwright.foundry.config.ts`) ignores every spec and
 * Playwright exits 0 after the skip banner; `FOUNDRY_INTEGRATION=required` turns
 * the missing install into a hard error. At the spec level, a failed GM join
 * skips the test (`test.skip(!joined, …)`) rather than failing spuriously.
 */

const CRIT_FLOWS = [
    'crit-helmet-torn-off',
    'crit-weapon-destroyed',
    'crit-item-dropped',
    'crit-armour-negated',
    'crit-munitions-detonate',
    'itempile-consumable-transfer',
    'itempile-stack-merge',
] as const;

type FlowName = (typeof CRIT_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeCriticalSideEffects(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            // ── Shapes the probe reaches into (Foundry browser globals + the
            //    two compiled system modules under test) ───────────────────────
            interface ItemState {
                equipped?: boolean;
                broken?: boolean;
            }
            interface ItemSystem {
                state?: ItemState;
                quantity?: number;
                class?: string;
            }
            interface ItemRef {
                _id?: string;
                name?: string | null;
                type?: string;
                system?: ItemSystem;
            }
            interface ActorRef {
                id?: string;
                items?: Iterable<ItemRef>;
                effects?: Iterable<object>;
                createEmbeddedDocuments?: (collection: string, data: object[]) => Promise<ItemRef[]>;
                delete?: () => Promise<void>;
            }
            interface ActorCls {
                create: (data: { type: string; name: string }) => Promise<ActorRef>;
            }
            interface CriticalDamageRiders {
                stunned: boolean;
                burning: boolean;
                bloodLoss: boolean;
                prone: boolean;
                blinded: boolean;
                deafened: boolean;
                fatigue: boolean;
                lostLimb: boolean;
                fatal: boolean;
                helmetTornOff: boolean;
                armourGate: 'none' | 'negates' | 'worsensIfUnarmoured';
                dropsHeldItem: boolean;
                weaponDestroyed: boolean;
                detonatesMunitions: boolean;
            }
            interface CritRecord {
                damageType: string;
                bodyPart: 'Head' | 'Body' | 'Arm' | 'Leg';
                severity: number;
                effect: string;
                riders: CriticalDamageRiders;
            }
            interface DetonatedMunition {
                name: string;
                damage: number | null;
                damageType: string | null;
                consumed: boolean;
            }
            interface SideEffectReport {
                armourNegated: boolean;
                unarmouredWorsens: boolean;
                helmetTornOff: string | null;
                itemDropped: string | null;
                weaponBroken: string | null;
                munitions: DetonatedMunition[];
                conditionsApplied: string[];
                hasSideEffects: boolean;
            }
            interface CriticalDamageModule {
                classifyCriticalEffect: (text: string) => CriticalDamageRiders;
                clampCriticalSeverity: (amount: number) => number;
            }
            interface ActiveEffectsModule {
                applyCriticalDamageConditions: (actor: ActorRef, record: CritRecord) => Promise<SideEffectReport>;
            }
            interface PlanStackMergeResult {
                updates: { quantity: number }[];
            }
            interface ItemDropManagerCls {
                planStackMerge: (existing: ItemRef[], incoming: ItemRef[]) => PlanStackMergeResult;
                pickupLoot: (receiver: ActorRef, pile: ActorRef) => Promise<boolean>;
            }
            interface ManagerModule {
                ItemDropManager: ItemDropManagerCls;
            }
            interface FoundryGlobal {
                Actor: ActorCls;
                game: { actors: { get: (id: string) => ActorRef | undefined } };
            }

            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as FoundryGlobal;

            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            const trash: ActorRef[] = [];

            const base = `${'/systems/wh40k-rpg'}/module`;
            const critMod = (await import(`${base}/rules/critical-damage.js`)) as CriticalDamageModule;
            const aeMod = (await import(`${base}/rules/active-effects.js`)) as ActiveEffectsModule;
            const mgrMod = (await import(`${base}/managers/item-drop-manager.js`)) as ManagerModule;

            // Build a CriticalDamageRecord from crafted prose run through the REAL
            // classifier, so each flow exercises prose → riders → appliers.
            const buildRecord = (effect: string, bodyPart: CritRecord['bodyPart'], damageType: string): CritRecord => ({
                damageType,
                bodyPart,
                severity: critMod.clampCriticalSeverity(6),
                effect,
                riders: critMod.classifyCriticalEffect(effect),
            });

            const liveItems = (actor: ActorRef): ItemRef[] => {
                const live = (actor.id != null ? g.game.actors.get(actor.id) : undefined) ?? actor;
                return Array.from(live.items ?? []);
            };
            const findByName = (actor: ActorRef, name: string): ItemRef | undefined => liveItems(actor).find((i) => i.name === name);

            // ── Flow 1 — helmet torn off (equipped head armour is unequipped) ──
            try {
                const actor = await g.Actor.create({ type: 'dh2-character', name: 'E2E Crit — Helmet' });
                trash.push(actor);
                await actor.createEmbeddedDocuments?.('Item', [
                    { name: 'E2E Mesh Coif', type: 'armour', system: { coverage: ['head'], state: { equipped: true } } },
                ]);
                const rec = buildRecord('A brutal blow to the head — his helmet is torn off.', 'Head', 'Rending');
                const report = await aeMod.applyCriticalDamageConditions(actor, rec);
                const helmet = findByName(actor, 'E2E Mesh Coif');
                const ok = [
                    rec.riders.helmetTornOff,
                    report.helmetTornOff === 'E2E Mesh Coif',
                    helmet?.system?.state?.equipped === false,
                    report.hasSideEffects,
                ].every(Boolean);
                record(
                    'crit-helmet-torn-off',
                    ok,
                    ok
                        ? null
                        : `rider=${String(rec.riders.helmetTornOff)} report=${String(report.helmetTornOff)} equipped=${String(
                              helmet?.system?.state?.equipped,
                          )}`,
                );
            } catch (err) {
                record('crit-helmet-torn-off', false, String((err as Error).message));
            }

            // ── Flow 2 — held weapon destroyed (broken + unequipped) ───────────
            try {
                const actor = await g.Actor.create({ type: 'dh2-character', name: 'E2E Crit — Weapon Destroyed' });
                trash.push(actor);
                await actor.createEmbeddedDocuments?.('Item', [
                    { name: 'E2E Chainsword', type: 'weapon', system: { class: 'melee', state: { equipped: true, broken: false } } },
                ]);
                const rec = buildRecord('The strike shatters the hand; the weapon he was holding is destroyed.', 'Arm', 'Rending');
                const report = await aeMod.applyCriticalDamageConditions(actor, rec);
                const st = findByName(actor, 'E2E Chainsword')?.system?.state;
                const ok = [
                    rec.riders.weaponDestroyed,
                    report.weaponBroken === 'E2E Chainsword',
                    report.itemDropped === null,
                    st?.broken === true,
                    st?.equipped === false,
                ].every(Boolean);
                record(
                    'crit-weapon-destroyed',
                    ok,
                    ok ? null : `rider=${String(rec.riders.weaponDestroyed)} broken=${String(report.weaponBroken)} state=${JSON.stringify(st)}`,
                );
            } catch (err) {
                record('crit-weapon-destroyed', false, String((err as Error).message));
            }

            // ── Flow 3 — held weapon dropped (unequipped, NOT broken) ──────────
            try {
                const actor = await g.Actor.create({ type: 'dh2-character', name: 'E2E Crit — Item Dropped' });
                trash.push(actor);
                await actor.createEmbeddedDocuments?.('Item', [
                    { name: 'E2E Laspistol', type: 'weapon', system: { class: 'pistol', state: { equipped: true, broken: false } } },
                ]);
                const rec = buildRecord('Pain lances up the arm and he drops his weapon.', 'Arm', 'Energy');
                const report = await aeMod.applyCriticalDamageConditions(actor, rec);
                const st = findByName(actor, 'E2E Laspistol')?.system?.state;
                const ok = [
                    rec.riders.dropsHeldItem,
                    !rec.riders.weaponDestroyed,
                    report.itemDropped === 'E2E Laspistol',
                    report.weaponBroken === null,
                    st?.equipped === false,
                    st?.broken !== true,
                ].every(Boolean);
                record(
                    'crit-item-dropped',
                    ok,
                    ok ? null : `dropRider=${String(rec.riders.dropsHeldItem)} dropped=${String(report.itemDropped)} state=${JSON.stringify(st)}`,
                );
            } catch (err) {
                record('crit-item-dropped', false, String((err as Error).message));
            }

            // ── Flow 4 — armour `negates` gate cancels the row (helmet stays) ──
            try {
                const actor = await g.Actor.create({ type: 'dh2-character', name: 'E2E Crit — Armour Negated' });
                trash.push(actor);
                await actor.createEmbeddedDocuments?.('Item', [
                    { name: 'E2E Storm Helm', type: 'armour', system: { coverage: ['head'], state: { equipped: true } } },
                ]);
                const rec = buildRecord('If he is wearing a helmet, he suffers no ill effects.', 'Head', 'Impact');
                const report = await aeMod.applyCriticalDamageConditions(actor, rec);
                const helmet = findByName(actor, 'E2E Storm Helm');
                // negated row does not tear the helmet off (equipped stays true)
                const ok = [
                    rec.riders.armourGate === 'negates',
                    report.armourNegated,
                    report.helmetTornOff === null,
                    helmet?.system?.state?.equipped === true,
                ].every(Boolean);
                record(
                    'crit-armour-negated',
                    ok,
                    ok ? null : `gate=${rec.riders.armourGate} negated=${String(report.armourNegated)} equipped=${String(helmet?.system?.state?.equipped)}`,
                );
            } catch (err) {
                record('crit-armour-negated', false, String((err as Error).message));
            }

            // ── Flow 5 — carried munitions detonate AND are expended (consumed) ─
            try {
                const actor = await g.Actor.create({ type: 'dh2-character', name: 'E2E Crit — Munitions' });
                trash.push(actor);
                await actor.createEmbeddedDocuments?.('Item', [
                    {
                        name: 'E2E Frag Grenade',
                        type: 'weapon',
                        system: { class: 'thrown', quantity: 2, damage: { formula: '1d10', bonus: 2, type: 'explosive' } },
                    },
                    { name: 'E2E Bolt Rounds', type: 'ammunition', system: { quantity: 3 } },
                ]);
                const rec = buildRecord('The ammunition and grenades he carries detonate in a chain of blasts.', 'Body', 'Explosive');
                const report = await aeMod.applyCriticalDamageConditions(actor, rec);
                const grenadeDmg = report.munitions.find((m) => m.name === 'E2E Frag Grenade')?.damage;
                const ammoDmg = report.munitions.find((m) => m.name === 'E2E Bolt Rounds')?.damage;
                // Post-detonation carried quantities: EXPENDED — the detonated munitions
                // are consumed (quantity zeroed) and reported as consumed.
                const grenadeQty = findByName(actor, 'E2E Frag Grenade')?.system?.quantity;
                const ammoQty = findByName(actor, 'E2E Bolt Rounds')?.system?.quantity;
                const grenadeDmgOk = typeof grenadeDmg === 'number' && grenadeDmg >= 3; // 1d10 (≥1) + bonus 2
                const ok = [
                    rec.riders.detonatesMunitions,
                    report.munitions.length === 2,
                    grenadeDmgOk,
                    ammoDmg === null, // loose ammunition → GM resolves
                    report.munitions.every((m) => m.consumed),
                    grenadeQty === 0,
                    ammoQty === 0,
                ].every(Boolean);
                record(
                    'crit-munitions-detonate',
                    ok,
                    ok
                        ? null
                        : `rider=${String(rec.riders.detonatesMunitions)} count=${String(report.munitions.length)} grenadeDmg=${String(
                              grenadeDmg,
                          )} ammoDmg=${String(ammoDmg)} qty=${String(grenadeQty)}/${String(ammoQty)}`,
                );
            } catch (err) {
                record('crit-munitions-detonate', false, String((err as Error).message));
            }

            // ── Flow 6 — item-pile consumable transfer integrity (loot pickup) ──
            try {
                const pile = await g.Actor.create({ type: 'loot', name: 'Dropped: E2E Munitions Cache' });
                const pileId = pile.id;
                await pile.createEmbeddedDocuments?.('Item', [
                    {
                        name: 'E2E Krak Grenade',
                        type: 'weapon',
                        system: { class: 'thrown', quantity: 2, damage: { formula: '2d10', bonus: 4, type: 'explosive' } },
                    },
                    { name: 'E2E Stub Rounds', type: 'ammunition', system: { quantity: 5 } },
                ]);
                const receiver = await g.Actor.create({ type: 'dh2-character', name: 'E2E Looter' });
                trash.push(receiver);
                const ok = await mgrMod.ItemDropManager.pickupLoot(receiver, pile);
                const got = liveItems(receiver);
                const grenade = got.filter((i) => i.name === 'E2E Krak Grenade');
                const ammo = got.filter((i) => i.name === 'E2E Stub Rounds');
                const transferred = [grenade.length === 1, ammo.length === 1].every(Boolean);
                // Consumable transfer integrity: quantities survive the move intact.
                const qtyIntact = [grenade[0]?.system?.quantity === 2, ammo[0]?.system?.quantity === 5].every(Boolean);
                const pileGone = pileId == null || g.game.actors.get(pileId) == null;
                const pass = [ok, transferred, qtyIntact, pileGone].every(Boolean);
                record(
                    'itempile-consumable-transfer',
                    pass,
                    pass
                        ? null
                        : `ok=${String(ok)} transferred=${String(transferred)} qtyIntact=${String(qtyIntact)} pileGone=${String(pileGone)} qty=${String(
                              grenade[0]?.system?.quantity,
                          )}/${String(ammo[0]?.system?.quantity)}`,
                );
            } catch (err) {
                record('itempile-consumable-transfer', false, String((err as Error).message));
            }

            // ── Flow 7 — stack-merge quantity math for a stacked consumable ─────
            try {
                const plan = mgrMod.ItemDropManager.planStackMerge(
                    // The existing stack MUST carry an `_id`: planStackMerge tallies
                    // (and later targets its update at) existing items by id, so an
                    // id-less existing stack is never merged into — the incoming
                    // stack would fall through to `creates` instead of `updates`.
                    [{ _id: 'e2eStubRoundsExisting', name: 'E2E Stub Rounds', type: 'ammunition', system: { quantity: 5 } }],
                    [{ name: 'E2E Stub Rounds', type: 'ammunition', system: { quantity: 4 } }],
                );
                const ok = plan.updates.length === 1 && plan.updates[0]?.quantity === 9;
                record('itempile-stack-merge', ok, ok ? null : `plan=${JSON.stringify(plan)}`);
            } catch (err) {
                record('itempile-stack-merge', false, String((err as Error).message));
            }

            // Cleanup world documents created by the probe (piles that were
            // consumed by pickup are already gone).
            for (const doc of trash) {
                try {
                    // eslint-disable-next-line no-await-in-loop -- best-effort serial cleanup; parallel deletes race on Foundry's collection writes
                    await doc.delete?.();
                } catch {
                    /* best-effort */
                }
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('critical side effects + consumption (Tier B)', () => {
    test('crit appliers mutate equipped gear, detonate munitions, and loot transfers consumables', async ({ page }) => {
        await joinOrSkip(page);

        const probe = await probeCriticalSideEffects(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (!r.ok) failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
        }
        for (const expected of CRIT_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${CRIT_FLOWS.length} crit/consumption flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('assign-damage card renders the Critical Side Effects readout and snaps', async ({ page }) => {
        await joinOrSkip(page);

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                interface FoundryRenderGlobals {
                    foundry?: {
                        applications?: {
                            handlebars?: {
                                renderTemplate?: (path: string, ctx: object) => Promise<string>;
                            };
                        };
                    };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const g = globalThis as unknown as FoundryRenderGlobals;
                const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate;
                if (typeof renderTemplateFn !== 'function') {
                    return { rendered: false, text: '', hasSystemAttr: false, hasWh40kAncestor: false, error: 'renderTemplate unavailable' };
                }

                const ctx = {
                    gameSystem: 'dh2',
                    actor: {
                        name: 'Acolyte Vex',
                        uuid: 'Actor.acolyte-vex',
                        system: { wounds: { value: 3, max: 12, critical: 2 }, fatigue: { value: 1, max: 12 } },
                    },
                    hasDamage: true,
                    hit: { location: 'Head', damageType: 'Rending' },
                    damageTaken: 9,
                    hasFatigueDamage: false,
                    hasCriticalDamage: true,
                    criticalDamageTaken: 3,
                    criticalEffect: 'The blow leaves the target reeling.',
                    hasCriticalSideEffects: true,
                    criticalSideEffects: {
                        armourNegated: false,
                        unarmouredWorsens: false,
                        helmetTornOff: 'Mesh Coif',
                        itemDropped: 'Chainsword',
                        weaponBroken: 'Godwyn-Deaz Boltgun',
                        munitions: [
                            { name: 'Frag Grenade', damage: 12, damageType: 'explosive' },
                            { name: 'Krak Missile', damage: null, damageType: null },
                        ],
                    },
                };

                let error: string | null = null;
                let html = '';
                try {
                    html = await renderTemplateFn('systems/wh40k-rpg/templates/chat/assign-damage-chat.hbs', ctx);
                } catch (renderErr) {
                    error = String((renderErr as Error).message);
                }

                if (!html) {
                    return { rendered: false, text: '', hasSystemAttr: false, hasWh40kAncestor: false, error: error ?? 'empty render' };
                }

                // Mount under a `.wh40k-rpg` ancestor so `important: '.wh40k-rpg'`
                // Tailwind scoping cascades as it would on a chat message
                // (CLAUDE.md Gotcha 3a). Left mounted for the snap outside evaluate.
                const host = document.createElement('div');
                host.id = '__c9critsfx';
                host.className = 'wh40k-rpg';
                host.style.position = 'fixed';
                host.style.top = '40px';
                host.style.left = '40px';
                host.style.width = '440px';
                host.style.zIndex = '99999';
                host.innerHTML = html;
                document.body.appendChild(host);

                const systemRoot = host.querySelector('[data-wh40k-system="dh2"]');
                return {
                    rendered: true,
                    text: host.textContent,
                    hasSystemAttr: systemRoot !== null,
                    hasWh40kAncestor: systemRoot?.closest('.wh40k-rpg') !== null,
                    error,
                };
            });

            await snap(page, 'assign-damage-critical-side-effects');

            await page.evaluate(() => {
                document.getElementById('__c9critsfx')?.remove();
            });

            expect(result.error, `card render error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'card did not render').toBe(true);
            expect(result.hasSystemAttr, 'data-wh40k-system should be dh2').toBe(true);
            expect(result.hasWh40kAncestor, 'card needs a .wh40k-rpg ancestor for Tailwind').toBe(true);

            // The "Critical Side Effects" readout rows (localized strings from en.json).
            const readout = [
                'Critical Side Effects',
                'Helmet torn off',
                'Mesh Coif',
                'Weapon destroyed — unusable until repaired',
                'Godwyn-Deaz Boltgun',
                'Dropped from hand',
                'Chainsword',
                'Carried munitions detonate!',
                'Frag Grenade: 12 explosive damage — GM distributes the blast',
                'Krak Missile detonates — GM resolves the blast per the effect text',
            ];
            for (const fragment of readout) {
                expect(result.text, `readout missing "${fragment}"`).toContain(fragment);
            }

            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);
        } finally {
            page.off('pageerror', listener);
        }
    });
});
