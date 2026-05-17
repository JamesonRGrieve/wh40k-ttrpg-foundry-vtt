import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Coverage of the modifier-template / equipment-effect pipeline. Targets:
 *   - `src/module/data/shared/modifiers-template.ts` (schema + getters)
 *   - `src/module/data/actor/templates/creature.ts` (_computeItemModifiers,
 *     _applyItemModifiers, _applyModifiersToCharacteristics,
 *     _applyModifiersToSkills, _computeArmour)
 *   - `src/module/utils/armour-calculator.ts` (equipped-armour AP aggregation)
 *   - `src/module/data/item/armour.ts` (equipped flag flow)
 *
 * Each flow embeds an item that contributes modifiers (talent, armour, gear),
 * then reads back the actor's prepared derived data and compares against the
 * baseline. Failures are collected into a list and asserted at the end so one
 * broken pipeline doesn't mask issues with the others. Single parent actor
 * created up front and deleted at the end.
 */

const FLOW_TALENT = 'talent-modifier-applies';
const FLOW_ARMOUR_AP = 'armour-equipped-grants-AP';
const FLOW_WEAPON_AE = 'weapon-equipped-active-effect';
const FLOW_UNEQUIP = 'unequip-removes-modifier';
const FLOW_STACK = 'stackable-modifier-stacks';
const FLOW_SKILL = 'modifier-on-skill';
const FLOW_CONDITION_MAG = 'modifier-condition-applied';

interface ActorRef {
    id: string;
}

interface FlowResult {
    ok: boolean;
    error: string | null;
}

async function createParentActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const Actor = (
            globalThis as unknown as {
                Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
            }
        ).Actor;
        if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await Actor.create({
                name: 'probe-modifiers-parent',
                type: 'bc-character',
                system: {
                    gameSystem: 'bc',
                    // Set a known non-zero baseline so additive modifiers are observable
                    // and so the unnatural-bonus floor doesn't zero-out subtle deltas.
                    characteristics: {
                        weaponSkill: { base: 30, advance: 0, modifier: 0 },
                        toughness: { base: 30, advance: 0, modifier: 0 },
                        strength: { base: 30, advance: 0, modifier: 0 },
                    },
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: String((err as Error)?.message ?? err) };
        }
    });
    if (!result.id) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const game = (
            globalThis as unknown as {
                game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
            }
        ).game;
        const actor = game?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

/**
 * Read the prepared derived value at a dotted path on the live actor.
 */
async function readActorPath(page: Page, actorId: string, path: string): Promise<number | null> {
    return page.evaluate(
        ({ actorId, path }) => {
            const game = (
                globalThis as unknown as {
                    game?: { actors?: { get?: (id: string) => unknown } };
                    foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
                }
            ).game;
            const foundry = (
                globalThis as unknown as {
                    foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
                }
            ).foundry;
            const actor = game?.actors?.get?.(actorId);
            const getProperty = foundry?.utils?.getProperty;
            if (!actor || !getProperty) return null;
            const v = getProperty(actor, path);
            const num = Number(v);
            return Number.isFinite(num) ? num : null;
        },
        { actorId, path },
    );
}

/**
 * Embed one or more items on the actor; return created IDs (or empty on error).
 */
async function createItems(page: Page, actorId: string, items: object[]): Promise<string[]> {
    return page.evaluate(
        async ({ actorId, items }) => {
            const game = (
                globalThis as unknown as {
                    game?: {
                        actors?: {
                            get?: (id: string) =>
                                | {
                                      createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                                  }
                                | undefined;
                        };
                    };
                }
            ).game;
            const actor = game?.actors?.get?.(actorId);
            if (!actor?.createEmbeddedDocuments) return [];
            try {
                const created = await actor.createEmbeddedDocuments('Item', items);
                return created.map((c) => c.id).filter((id): id is string => typeof id === 'string');
            } catch {
                return [];
            }
        },
        { actorId, items },
    );
}

async function deleteItems(page: Page, actorId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await page.evaluate(
        async ({ actorId, itemIds }) => {
            const game = (
                globalThis as unknown as {
                    game?: {
                        actors?: {
                            get?: (id: string) =>
                                | { deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown> }
                                | undefined;
                        };
                    };
                }
            ).game;
            const actor = game?.actors?.get?.(actorId);
            try {
                await actor?.deleteEmbeddedDocuments?.('Item', itemIds);
            } catch {
                /* best-effort */
            }
        },
        { actorId, itemIds },
    );
}

async function updateItem(page: Page, actorId: string, itemId: string, patch: object): Promise<boolean> {
    return page.evaluate(
        async ({ actorId, itemId, patch }) => {
            const game = (
                globalThis as unknown as {
                    game?: {
                        actors?: {
                            get?: (id: string) =>
                                | { items?: { get?: (id: string) => { update?: (data: object) => Promise<unknown> } | undefined } }
                                | undefined;
                        };
                    };
                }
            ).game;
            const actor = game?.actors?.get?.(actorId);
            const item = actor?.items?.get?.(itemId);
            try {
                await item?.update?.(patch);
                return true;
            } catch {
                return false;
            }
        },
        { actorId, itemId, patch },
    );
}

/**
 * Talent with a +5 weaponSkill characteristic modifier — should land in
 * `actor.characteristics.weaponSkill.total` via
 * CreatureTemplate._applyModifiersToCharacteristics → _getTotalCharacteristicModifier.
 */
async function probeTalentModifier(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.characteristics.weaponSkill.total')) ?? 0;
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-talent-ws-bonus',
            type: 'talent',
            system: { modifiers: { characteristics: { weaponSkill: 5 } } },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'talent item create failed' };
    try {
        const after = (await readActorPath(page, actorId, 'system.characteristics.weaponSkill.total')) ?? 0;
        const ok = after === baseline + 5;
        return { ok, error: ok ? null : `expected ${baseline + 5} after talent, got ${after}` };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Equipped armour with `armourPoints.head: 4` should bump
 * `actor.system.armour.head.total` by 4 (max-per-location aggregation
 * in computeArmour). Coverage is on armour-calculator.ts.
 */
async function probeArmourAP(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.armour.head.total')) ?? 0;
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-armour-head-4',
            type: 'armour',
            system: {
                equipped: true,
                armourPoints: { head: 4, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },
                coverage: ['head'],
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'armour item create failed' };
    try {
        const after = (await readActorPath(page, actorId, 'system.armour.head.total')) ?? 0;
        const ok = after === baseline + 4;
        return { ok, error: ok ? null : `expected ${baseline + 4} head AP after equip, got ${after}` };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Weapon item with a transferred ActiveEffect adding +3 weaponSkill modifier.
 * Verifies the ActiveEffect transfer pipeline for items the actor "wields".
 */
async function probeWeaponAE(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.characteristics.weaponSkill.total')) ?? 0;
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-weapon-ae',
            type: 'weapon',
            effects: [
                {
                    name: 'probe-weapon-bonus',
                    transfer: true,
                    disabled: false,
                    changes: [
                        {
                            key: 'system.characteristics.weaponSkill.modifier',
                            value: '3',
                            mode: 2 /* ADD */,
                        },
                    ],
                },
            ],
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'weapon item create failed' };
    try {
        const after = (await readActorPath(page, actorId, 'system.characteristics.weaponSkill.total')) ?? 0;
        const ok = after === baseline + 3;
        return { ok, error: ok ? null : `expected ${baseline + 3} after weapon AE transfer, got ${after}` };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Cybernetic item flagged equipped with +2 toughness modifier; toggle equipped
 * off and verify the modifier drops away (covers _computeItemModifiers'
 * `item.system.equipped === true` branch). Cybernetic is used because it
 * mixes both EquippableTemplate AND ModifiersTemplate — gear has Equippable
 * but no Modifiers schema, so a `system.modifiers.*` field is dropped on
 * create and the round-trip never observes a delta.
 */
async function probeUnequipRollback(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.characteristics.toughness.total')) ?? 0;
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-cybernetic-tough-2',
            type: 'cybernetic',
            system: {
                equipped: true,
                modifiers: { characteristics: { toughness: 2 } },
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'cybernetic item create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'cybernetic item id missing' };
    try {
        const equipped = (await readActorPath(page, actorId, 'system.characteristics.toughness.total')) ?? 0;
        if (equipped !== baseline + 2) {
            return { ok: false, error: `expected +2 when equipped, baseline=${baseline}, got=${equipped}` };
        }
        const ok = await updateItem(page, actorId, itemId, { 'system.equipped': false });
        if (!ok) return { ok: false, error: 'item.update({equipped:false}) threw' };
        const unequipped = (await readActorPath(page, actorId, 'system.characteristics.toughness.total')) ?? 0;
        if (unequipped !== baseline) {
            return { ok: false, error: `expected rollback to ${baseline} on unequip, got ${unequipped}` };
        }
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Two talents each with +4 strength — the modifier-source accumulator should
 * sum them. Covers _getTotalCharacteristicModifier's reduce loop with >1 entry.
 */
async function probeStackable(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.characteristics.strength.total')) ?? 0;
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-talent-str-a',
            type: 'talent',
            system: { modifiers: { characteristics: { strength: 4 } } },
        },
        {
            name: 'probe-talent-str-b',
            type: 'talent',
            system: { modifiers: { characteristics: { strength: 4 } } },
        },
    ]);
    if (ids.length < 2) return { ok: false, error: `stack create returned ${ids.length} ids` };
    try {
        const after = (await readActorPath(page, actorId, 'system.characteristics.strength.total')) ?? 0;
        const ok = after === baseline + 8;
        return { ok, error: ok ? null : `expected ${baseline + 8} after stacked talents, got ${after}` };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Talent with a skill modifier (+10 dodge) — verify it lands on
 * skills.dodge.current via _applyModifiersToSkills.
 */
async function probeSkillModifier(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.skills.dodge.current')) ?? 0;
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-talent-dodge-10',
            type: 'talent',
            system: { modifiers: { skills: { dodge: 10 } } },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'skill-mod talent create failed' };
    try {
        const after = (await readActorPath(page, actorId, 'system.skills.dodge.current')) ?? 0;
        const ok = after === baseline + 10;
        return { ok, error: ok ? null : `expected ${baseline + 10} skills.dodge.current, got ${after}` };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Verify a condition-style AE with a NEGATIVE characteristic modifier lands at
 * the expected magnitude. Mirrors `createConditionEffect`'s Blinded definition
 * (system.characteristics.weaponSkill.modifier -= 30) by creating the AE
 * directly so the test doesn't depend on the rules/active-effects.ts helper
 * being importable from page.evaluate.
 */
async function probeConditionMagnitude(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.characteristics.weaponSkill.total')) ?? 0;
    const result = await page.evaluate(async (actorId: string) => {
        const game = (
            globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) =>
                            | {
                                  createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                                  deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
                              }
                            | undefined;
                    };
                };
            }
        ).game;
        const actor = game?.actors?.get?.(actorId);
        if (!actor?.createEmbeddedDocuments) return { effectId: null, error: 'actor missing createEmbeddedDocuments' };
        try {
            const created = await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'probe-stunned-magnitude',
                    disabled: false,
                    changes: [{ key: 'system.characteristics.weaponSkill.modifier', value: '-30', mode: 2 /* ADD */ }],
                },
            ]);
            const id = created[0]?.id ?? null;
            return { effectId: id, error: null };
        } catch (err) {
            return { effectId: null, error: String((err as Error)?.message ?? err) };
        }
    }, actorId);
    if (!result.effectId) return { ok: false, error: `condition AE create failed: ${result.error ?? 'unknown'}` };
    const effectId = result.effectId;
    try {
        const after = (await readActorPath(page, actorId, 'system.characteristics.weaponSkill.total')) ?? 0;
        const ok = after === baseline - 30;
        return { ok, error: ok ? null : `expected ${baseline - 30} after -30 condition mod, got ${after}` };
    } finally {
        await page
            .evaluate(
                async ({ actorId, effectId }) => {
                    const game = (
                        globalThis as unknown as {
                            game?: {
                                actors?: {
                                    get?: (id: string) =>
                                        | { deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown> }
                                        | undefined;
                                };
                            };
                        }
                    ).game;
                    const actor = game?.actors?.get?.(actorId);
                    try {
                        await actor?.deleteEmbeddedDocuments?.('ActiveEffect', [effectId]);
                    } catch {
                        /* best-effort */
                    }
                },
                { actorId, effectId },
            )
            .catch(() => undefined);
    }
}

test.describe.serial('modifiers / equipment-effect pipeline (Tier B)', () => {
    test('every supported modifier flow lands on actor derived data', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const parent = await createParentActor(page);
        expect('id' in parent, `parent actor create failed: ${'error' in parent ? parent.error : 'unknown'}`).toBe(true);
        const actorId = (parent as ActorRef).id;

        const failures: string[] = [];
        try {
            const probes: Array<{ flow: string; run: () => Promise<FlowResult> }> = [
                { flow: FLOW_TALENT, run: () => probeTalentModifier(page, actorId) },
                { flow: FLOW_ARMOUR_AP, run: () => probeArmourAP(page, actorId) },
                { flow: FLOW_WEAPON_AE, run: () => probeWeaponAE(page, actorId) },
                { flow: FLOW_UNEQUIP, run: () => probeUnequipRollback(page, actorId) },
                { flow: FLOW_STACK, run: () => probeStackable(page, actorId) },
                { flow: FLOW_SKILL, run: () => probeSkillModifier(page, actorId) },
                { flow: FLOW_CONDITION_MAG, run: () => probeConditionMagnitude(page, actorId) },
            ];
            for (const probe of probes) {
                const result = await probe.run();
                if (result.ok) {
                    recordCoverage('modifier.flow', probe.flow);
                } else {
                    failures.push(`${probe.flow}: ${result.error ?? 'unknown error'}`);
                }
            }
        } finally {
            await deleteActor(page, actorId).catch(() => undefined);
        }

        expect(failures, `${failures.length} modifier flow(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
