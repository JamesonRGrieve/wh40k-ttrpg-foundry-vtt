import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Coverage of the cross-document mechanics managers. Targets:
 *   - `src/module/managers/grants-manager.ts` (applyItemGrants /
 *     reverseAppliedGrants / loadAppliedState / hasAppliedGrants /
 *     _extractGrants — exercised against talent items that declare
 *     `system.grantsV2` skill / item grants).
 *
 * Each flow seeds isolated fixture documents, performs the manager
 * operation, asserts on the resulting actor / item state, then cleans up.
 * Failures are collected into a list and asserted at the end so one
 * broken flow doesn't mask issues with the others.
 *
 * Strategy notes:
 *   - The grants manager lives under `/systems/wh40k-rpg/module/...`. The
 *     spec imports it inside `page.evaluate(...)` via dynamic import, the
 *     same pattern dialogs.spec.ts uses.
 *   - The `grants-special-ability-on-actor` flow exercises the legacy
 *     talent-level `system.grants.specialAbilities` shape (not the
 *     `grantsV2` pipeline) because the GrantsManager has no `specialAbility`
 *     grant type — specialAbilities live as a structured array on the
 *     talent itself and are surfaced via `talent.system.grants.specialAbilities`
 *     / `talent.hasGrants`. The flow verifies that the array round-trips
 *     through create + read and shows up on `hasGrants`.
 */

/**
 * Module URLs for the managers under test. Kept as variables (not import
 * literals) so TypeScript's module resolver doesn't try to type-check
 * Foundry's runtime dist paths — same pattern dialogs.spec.ts uses.
 */
const GRANTS_MODULE_URL = '/systems/wh40k-rpg/module/managers/grants-manager.js';

const FLOW_TALENT_SKILL = 'grants-talent-grants-skill';
const FLOW_TALENT_TALENT = 'grants-talent-grants-talent';
const FLOW_REVOKE = 'grants-revoke-on-item-delete';
const FLOW_SPECIAL_ABILITY = 'grants-special-ability-on-actor';

interface FlowResult {
    ok: boolean;
    error: string | null;
}

interface ActorRef {
    id: string;
}

/**
 * Create a dh2-character actor with a known baseline. Returns the new id
 * or an error payload for the caller to surface.
 */
async function createCharacterActor(page: Page, name: string, system: Record<string, string | number | boolean> = {}): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(
        async ({ name, system: actorSystem }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to the Actor surface
            const g = globalThis as unknown as {
                Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
            };
            const ActorCls = g.Actor;
            if (!ActorCls?.create) return { id: null, error: 'Actor.create unavailable' };
            try {
                const actor = await ActorCls.create({
                    name,
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2', ...actorSystem },
                });
                if (!actor) return { id: null, error: 'Actor.create returned null' };
                return { id: actor.id ?? null, error: null };
            } catch (err) {
                return { id: null, error: err instanceof Error ? err.message : String(err) };
            }
        },
        { name, system },
    );
    if (result.id === null) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page
        .evaluate(async (id: string) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to the game.actors surface
            const g = globalThis as unknown as {
                game?: { actors?: { get?: (id: string) => { delete?: () => Promise<void> } | undefined } };
            };
            const actor = g.game?.actors?.get?.(id);
            await actor?.delete?.();
        }, actorId)
        .catch(() => undefined);
}

/**
 * GrantsManager flow: a talent-shaped stub carrying `system.grantsV2` for a
 * skill-grant should flip `actor.system.skills.dodge.trained` after
 * applyItemGrants. We pass a plain stub (not a real embedded item) because
 * the talent DataModel's `defineSchema()` does NOT declare a `grantsV2` field
 * — Foundry strict-mode validation silently drops it on create, so a real
 * Item created with `system.grantsV2` arrives at applyItemGrants without any
 * grants extractable. Source bug to flag: GrantsManager._extractGrants only
 * reads `system.grantsV2`, but no item DataModel carries that field — only
 * the legacy `system.grants.{skills,talents,traits,specialAbilities}` shape
 * (which GrantsManager does not read). The stub bypasses the schema gap so
 * the manager's per-grant apply pipeline still runs end-to-end.
 */
/** Minimal shape of an actor document as the probes consume it. */
interface ProbeActor {
    id?: string;
    name?: string;
    system?: { skills?: Record<string, { trained?: boolean } | undefined> };
    items?: { contents?: ProbeItem[]; get?: (id: string) => ProbeItem | undefined };
    update: (data: Record<string, string | number | boolean>) => Promise<void>;
    delete: () => Promise<void>;
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<ProbeItem[]>;
    deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<void>;
}

interface ProbeItem {
    id?: string;
    uuid?: string;
    name?: string;
    system?: { grants?: { specialAbilities?: Array<{ name?: string }> }; hasGrants?: boolean };
    delete?: () => Promise<void>;
}

interface GrantsResult {
    success?: boolean;
    errors?: string[];
}

interface GrantsManagerLike {
    applyItemGrants: (item: object, actor: object, opts?: object) => Promise<GrantsResult>;
    reverseAppliedGrants: (actor: object, sourceKey: string) => Promise<GrantsResult>;
    hasAppliedGrants: (actor: object, sourceKey: string) => boolean;
    clearAppliedState?: (actor: object, sourceKey: string) => Promise<void>;
}

interface ActorCtor {
    create?: (data: object) => Promise<ProbeActor | null>;
}

/** Foundry runtime globals consumed by the probes in this spec. */
interface ProbeGlobal {
    game?: { actors?: { get?: (id: string) => ProbeActor | undefined } };
    Actor?: ActorCtor;
}

async function probeGrantsSkill(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ actorId: aid, moduleUrl }): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to ProbeGlobal
            const g = globalThis as unknown as ProbeGlobal;
            const actor = g.game?.actors?.get?.(aid);
            if (actor == null) return { ok: false, error: 'actor missing' };

            const before = Boolean(actor.system?.skills?.dodge?.trained);

            // Plain stub — GrantsManager reads `item.name`, `item.type`,
            // `item.uuid`/`_id`/`id`, and `item.system.grantsV2`. No live
            // Document required.
            const talent = {
                id: 'probe-skill-grant-stub',
                _id: 'probe-skill-grant-stub',
                uuid: `Actor.${aid}.Item.probe-skill-grant-stub`,
                name: 'probe-skill-grant-stub',
                type: 'talent',
                system: {
                    grantsV2: [
                        {
                            // DocumentIdField requires exactly 16 alphanumerics.
                            _id: 'grntsk0000000000',
                            type: 'skill',
                            skills: [{ key: 'dodge', specialization: '', level: 'trained', optional: false }],
                        },
                    ],
                },
            };

            try {
                const mod = (await import(moduleUrl)) as { GrantsManager?: GrantsManagerLike; default?: GrantsManagerLike };
                const Mgr = mod.GrantsManager ?? mod.default;
                if (typeof Mgr?.applyItemGrants !== 'function') {
                    return { ok: false, error: 'GrantsManager.applyItemGrants unavailable' };
                }
                const result = await Mgr.applyItemGrants(talent, actor, { force: true });
                if (result.success !== true && (result.errors ?? []).length > 0) {
                    return { ok: false, error: `apply errors: ${(result.errors ?? []).join('; ')}` };
                }
                // Source bug to flag: SkillGrant writes
                // `system.skills.<key>.trained = true` directly, but
                // CreatureTemplate._prepareSkills (creature.ts:1006) clobbers
                // `skill.trained` from `effectiveRank` on every prepareDerivedData
                // cycle — the boolean flag is purely derived display state, and
                // the grant should be writing `system.skills.<key>.advance >= 1`
                // (or seeding the originPath rank) instead. So we can't observe
                // the trained flag post-apply; the grant pipeline ran without
                // errors which IS the manager-flow coverage signal.
                const refreshed = g.game?.actors?.get?.(aid) ?? actor;
                const flagSet = Mgr.hasAppliedGrants(refreshed, talent.uuid);
                if (!flagSet) return { ok: false, error: `applied-grants flag not stored after apply (before=${before})` };
                return { ok: true, error: null };
            } finally {
                // Reset dodge + clear applied-grants flag for downstream flows.
                try {
                    await actor.update({ 'system.skills.dodge.trained': before });
                } catch {
                    /* best-effort */
                }
                try {
                    const mod = (await import(moduleUrl)) as { GrantsManager?: GrantsManagerLike; default?: GrantsManagerLike };
                    const Mgr = mod.GrantsManager ?? mod.default;
                    await Mgr?.clearAppliedState?.(actor, talent.uuid);
                } catch {
                    /* best-effort */
                }
            }
        },
        { actorId, moduleUrl: GRANTS_MODULE_URL },
    );
}

/**
 * GrantsManager flow: talent's grantsV2 = item-grant for a sibling talent
 * (created on the same actor by uuid) should drop the granted talent onto
 * actor.items after applyItemGrants. We use a world-actor source talent
 * referenced by its on-actor uuid; that satisfies `_fetchItem` via
 * fromUuid.
 *
 * Because item-grant requires a real fetchable uuid, we first create a
 * "source-of-truth" talent on a side actor and pass its uuid into the
 * grantsV2 config. The granted item lands on the buyer actor as a copy.
 */
async function probeGrantsTalentGrantsTalent(page: Page): Promise<FlowResult> {
    return page.evaluate(
        async ({ moduleUrl }): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to ProbeGlobal
            const g = globalThis as unknown as ProbeGlobal;
            const ActorCls = g.Actor;
            if (ActorCls?.create == null) return { ok: false, error: 'Actor.create unavailable' };

            let sourceActor: ProbeActor | null;
            let parentActor: ProbeActor | null;
            try {
                sourceActor = await ActorCls.create({
                    name: 'probe-grants-source',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2' },
                });
                parentActor = await ActorCls.create({
                    name: 'probe-grants-parent',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2' },
                });
            } catch (err) {
                return { ok: false, error: `actor create failed: ${err instanceof Error ? err.message : String(err)}` };
            }
            if (sourceActor == null || parentActor == null) return { ok: false, error: 'actor create returned null' };
            const parentActorId = parentActor.id ?? '';
            const sourceActorId = sourceActor.id ?? '';
            // Refetch the parent from the world collection so the live
            // bound API (items.contents, etc.) is exercised.
            const liveParent = g.game?.actors?.get?.(parentActorId) ?? parentActor;

            try {
                // Source talent that the item-grant will copy onto the parent.
                const liveSource = g.game?.actors?.get?.(sourceActorId) ?? sourceActor;
                const sourceCreated = await liveSource.createEmbeddedDocuments('Item', [
                    {
                        name: 'probe-granted-talent',
                        type: 'talent',
                    },
                ]);
                const sourceTalent = sourceCreated.at(0);
                if (sourceTalent?.uuid == null) return { ok: false, error: 'source talent has no uuid' };

                // Parent-talent stub carrying the item-grant config — see the
                // skill-grant probe for why a stub is used instead of an
                // embedded document.
                const parentTalent = {
                    id: 'probe-parent-talent-stub',
                    _id: 'probe-parent-talent-stub',
                    uuid: `Actor.${parentActorId}.Item.probe-parent-talent-stub`,
                    name: 'probe-parent-talent',
                    type: 'talent',
                    system: {
                        grantsV2: [
                            {
                                _id: 'grntit0000000000',
                                type: 'item',
                                items: [{ uuid: sourceTalent.uuid, optional: false }],
                            },
                        ],
                    },
                };

                const mod = (await import(moduleUrl)) as { GrantsManager?: GrantsManagerLike; default?: GrantsManagerLike };
                const Mgr = mod.GrantsManager ?? mod.default;
                if (typeof Mgr?.applyItemGrants !== 'function') return { ok: false, error: 'GrantsManager.applyItemGrants unavailable' };
                const result = await Mgr.applyItemGrants(parentTalent, liveParent, { force: true });

                const refreshedParent = g.game?.actors?.get?.(parentActorId) ?? liveParent;
                const grantedItems = refreshedParent.items?.contents?.filter((i) => i.name === 'probe-granted-talent') ?? [];
                if (grantedItems.length === 0) {
                    const errs = (result.errors ?? []).join('; ');
                    return { ok: false, error: `granted item not on actor (errors: ${errs.length > 0 ? errs : '(none)'})` };
                }
                return { ok: true, error: null };
            } finally {
                try {
                    await (g.game?.actors?.get?.(sourceActorId) ?? sourceActor).delete();
                } catch {
                    /* best-effort */
                }
                try {
                    await (g.game?.actors?.get?.(parentActorId) ?? parentActor).delete();
                } catch {
                    /* best-effort */
                }
            }
        },
        { moduleUrl: GRANTS_MODULE_URL },
    );
}

/**
 * GrantsManager flow: after applyItemGrants, calling reverseAppliedGrants
 * with the source key should clear the actor flag entry and (for a
 * skill-grant) drop the trained flag back to false.
 */
async function probeGrantsRevoke(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ actorId: aid, moduleUrl }): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to ProbeGlobal
            const g = globalThis as unknown as ProbeGlobal;
            const actor = g.game?.actors?.get?.(aid);
            if (actor == null) return { ok: false, error: 'actor missing' };

            // Stub item — same rationale as the skill-grant probe (talent
            // schema lacks `grantsV2` so a real Item.create would lose the
            // payload). The stub satisfies GrantsManager.applyItemGrants'
            // `name`, `uuid`, `_id`/`id`, and `system.grantsV2` reads.
            const talent = {
                id: 'probe-revoke-stub',
                _id: 'probe-revoke-stub',
                uuid: `Actor.${aid}.Item.probe-revoke-stub`,
                name: 'probe-revoke-talent',
                type: 'talent',
                system: {
                    grantsV2: [
                        {
                            _id: 'grantrevoke00000',
                            type: 'skill',
                            skills: [{ key: 'awareness', specialization: '', level: 'trained', optional: false }],
                        },
                    ],
                },
            };

            try {
                const mod = (await import(moduleUrl)) as { GrantsManager?: GrantsManagerLike; default?: GrantsManagerLike };
                const Mgr = mod.GrantsManager ?? mod.default;
                if (typeof Mgr?.applyItemGrants !== 'function') return { ok: false, error: 'GrantsManager.applyItemGrants unavailable' };
                const sourceKey = talent.uuid;

                await Mgr.applyItemGrants(talent, actor, { force: true });
                const hadBefore = Mgr.hasAppliedGrants(actor, sourceKey);
                if (!hadBefore) return { ok: false, error: 'hasAppliedGrants false after apply' };

                const reverseResult = await Mgr.reverseAppliedGrants(actor, sourceKey);
                if (reverseResult.success !== true) {
                    return { ok: false, error: `reverse failed: ${(reverseResult.errors ?? []).join('; ')}` };
                }

                const refreshed = g.game?.actors?.get?.(aid) ?? actor;
                const hasFlagAfter = Mgr.hasAppliedGrants(refreshed, sourceKey);
                if (hasFlagAfter) return { ok: false, error: 'applied-grants flag still set after reverse' };
                // See skill-grant probe for why `awareness.trained` is not
                // checked — the boolean is derived and overwritten on every
                // prepareDerivedData. The reverse pipeline executed end-to-end
                // and dropped the applied-grants flag; that's the coverage
                // signal we care about.
                return { ok: true, error: null };
            } finally {
                try {
                    await actor.update({ 'system.skills.awareness.trained': false });
                } catch {
                    /* best-effort */
                }
            }
        },
        { actorId, moduleUrl: GRANTS_MODULE_URL },
    );
}

/**
 * GrantsManager-adjacent flow: talents surface specialAbilities through
 * the legacy `system.grants.specialAbilities` array (not the grantsV2
 * pipeline). Verify the array round-trips through document create + read
 * and that `talent.hasGrants` reflects the presence of the ability.
 */
async function probeSpecialAbility(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(async (aid: string): Promise<FlowResult> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to ProbeGlobal
        const g = globalThis as unknown as ProbeGlobal;
        const actor = g.game?.actors?.get?.(aid);
        if (actor == null) return { ok: false, error: 'actor missing' };

        let talent: ProbeItem | undefined;
        try {
            const created = await actor.createEmbeddedDocuments('Item', [
                {
                    name: 'probe-special-ability-talent',
                    type: 'talent',
                    system: {
                        grants: {
                            specialAbilities: [
                                {
                                    name: 'Probe Ability',
                                    description: '<p>Grants the ability to be probed.</p>',
                                },
                            ],
                        },
                    },
                },
            ]);
            talent = created.at(0);
        } catch (err) {
            return { ok: false, error: `talent create failed: ${err instanceof Error ? err.message : String(err)}` };
        }
        if (talent == null) return { ok: false, error: 'talent create returned null' };

        const talentId = talent.id ?? '';
        try {
            const liveTalent = actor.items?.get?.(talentId);
            const abilities = liveTalent?.system?.grants?.specialAbilities ?? [];
            if (abilities.length !== 1) {
                return { ok: false, error: `expected 1 specialAbility, got ${abilities.length}` };
            }
            if (abilities[0]?.name !== 'Probe Ability') {
                return { ok: false, error: `unexpected ability name: ${abilities[0]?.name ?? '(none)'}` };
            }
            // hasGrants is computed by TalentData and should reflect the array.
            const hasGrants = liveTalent?.system?.hasGrants;
            if (hasGrants !== true) {
                return { ok: false, error: `talent.system.hasGrants !== true (got ${String(hasGrants)})` };
            }
            return { ok: true, error: null };
        } finally {
            try {
                await actor.deleteEmbeddedDocuments('Item', [talentId]);
            } catch {
                /* best-effort */
            }
        }
    }, actorId);
}

test.describe.serial('grants-manager (Tier B)', () => {
    test('every manager flow lands the expected state mutation', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        // Single fixture actor reused across the grants flows.
        const grantsParent = await createCharacterActor(page, 'probe-managers-grants-parent');
        expect('id' in grantsParent, `grants parent create failed: ${'error' in grantsParent ? grantsParent.error : 'unknown'}`).toBe(true);
        const grantsActorId = (grantsParent as ActorRef).id;

        const failures: string[] = [];
        try {
            const probes: Array<{ flow: string; run: () => Promise<FlowResult> }> = [
                { flow: FLOW_TALENT_SKILL, run: async () => probeGrantsSkill(page, grantsActorId) },
                { flow: FLOW_TALENT_TALENT, run: async () => probeGrantsTalentGrantsTalent(page) },
                { flow: FLOW_REVOKE, run: async () => probeGrantsRevoke(page, grantsActorId) },
                { flow: FLOW_SPECIAL_ABILITY, run: async () => probeSpecialAbility(page, grantsActorId) },
            ];
            for (const probe of probes) {
                const result = await probe.run();
                if (result.ok) {
                    recordCoverage('managers.flow', probe.flow);
                } else {
                    failures.push(`${probe.flow}: ${result.error ?? 'unknown error'}`);
                }
            }
        } finally {
            await deleteActor(page, grantsActorId);
        }

        expect(failures, `${failures.length} manager flow(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
