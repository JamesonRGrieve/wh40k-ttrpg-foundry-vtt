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
 *   - `src/module/transactions/transaction-manager.ts` (getProfile /
 *     setMode / listSourcesForBuyer / listItemsForSource / prepareQuote /
 *     commitTransaction — exercised against a buyer + source actor pair
 *     where the source is configured as a barter shopfront).
 *
 * Each flow seeds isolated fixture documents, performs the manager
 * operation, asserts on the resulting actor / item state, then cleans up.
 * Failures are collected into a list and asserted at the end so one
 * broken flow doesn't mask issues with the others.
 *
 * Strategy notes:
 *   - Both managers live under `/systems/wh40k-rpg/module/...`. The spec
 *     imports them inside `page.evaluate(...)` via dynamic import, the
 *     same pattern dialogs.spec.ts uses.
 *   - The `transaction-acquire-item-from-source` and
 *     `transaction-sell-item` flows skip the dialog / socket / GM-approval
 *     path entirely and call `TransactionManager.commitTransaction(...)`
 *     directly with a pre-built request payload. The dialog surface is
 *     covered by `dialogs.spec.ts`; this spec is about the manager.
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
const TRANSACTION_MODULE_URL = '/systems/wh40k-rpg/module/transactions/transaction-manager.js';

const FLOW_TALENT_SKILL = 'grants-talent-grants-skill';
const FLOW_TALENT_TALENT = 'grants-talent-grants-talent';
const FLOW_REVOKE = 'grants-revoke-on-item-delete';
const FLOW_SPECIAL_ABILITY = 'grants-special-ability-on-actor';
const FLOW_ACQUIRE = 'transaction-acquire-item-from-source';
const FLOW_SELL = 'transaction-sell-item';
const FLOW_LIST_SOURCES = 'transaction-list-sources-for-buyer';

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
async function createCharacterActor(page: Page, name: string, system: Record<string, unknown> = {}): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(
        async ({ name, system }) => {
            const g = globalThis as unknown as {
                Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
            };
            const Actor = g.Actor;
            if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
            try {
                const actor = await Actor.create({
                    name,
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e', ...system },
                });
                if (!actor) return { id: null, error: 'Actor.create returned null' };
                return { id: actor.id ?? null, error: null };
            } catch (err) {
                return { id: null, error: String((err as Error)?.message ?? err) };
            }
        },
        { name, system },
    );
    if (!result.id) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page
        .evaluate(async (id: string) => {
            const g = globalThis as unknown as {
                game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
            };
            const actor = g.game?.actors?.get?.(id);
            await actor?.delete?.();
        }, actorId)
        .catch(() => undefined);
}

/**
 * GrantsManager flow: talent's grantsV2 = skill-grant for dodge:trained
 * should flip `actor.system.skills.dodge.trained` after applyItemGrants.
 */
async function probeGrantsSkill(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ actorId, moduleUrl }): Promise<FlowResult> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const actor = g.game?.actors?.get?.(actorId);
            if (!actor) return { ok: false, error: 'actor missing' };

            const before = Boolean(actor.system?.skills?.dodge?.trained);

            let talent: any;
            try {
                const created = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'probe-skill-grant-talent',
                        type: 'talent',
                        system: {
                            grantsV2: [
                                {
                                    _id: 'grantskill0000000',
                                    type: 'skill',
                                    skills: [{ key: 'dodge', specialization: '', level: 'trained', optional: false }],
                                },
                            ],
                        },
                    },
                ]);
                talent = created[0] ?? null;
            } catch (err) {
                return { ok: false, error: `talent create failed: ${String((err as Error)?.message ?? err)}` };
            }
            if (!talent) return { ok: false, error: 'talent create returned null' };

            try {
                const mod = await import(moduleUrl);
                const Mgr = mod.GrantsManager ?? mod.default;
                if (typeof Mgr?.applyItemGrants !== 'function') {
                    return { ok: false, error: 'GrantsManager.applyItemGrants unavailable' };
                }
                const result = await Mgr.applyItemGrants(talent, actor, { force: true });
                const refreshed = g.game?.actors?.get?.(actorId);
                const after = Boolean(refreshed?.system?.skills?.dodge?.trained);
                if (!result?.success && (result?.errors ?? []).length > 0) {
                    return { ok: false, error: `apply errors: ${(result.errors as string[]).join('; ')}` };
                }
                if (!after) return { ok: false, error: `dodge.trained not set (before=${before}, after=${after})` };
                return { ok: true, error: null };
            } finally {
                try {
                    await actor.deleteEmbeddedDocuments('Item', [talent.id]);
                } catch {
                    /* best-effort */
                }
                // Reset dodge to baseline for downstream flows.
                try {
                    await actor.update({ 'system.skills.dodge.trained': before });
                } catch {
                    /* best-effort */
                }
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
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
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe */
            const g = globalThis as any;
            const Actor = g.Actor;
            if (!Actor?.create) return { ok: false, error: 'Actor.create unavailable' };

            let sourceActor: any;
            let parentActor: any;
            try {
                sourceActor = await Actor.create({
                    name: 'probe-grants-source',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e' },
                });
                parentActor = await Actor.create({
                    name: 'probe-grants-parent',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e' },
                });
            } catch (err) {
                return { ok: false, error: `actor create failed: ${String((err as Error)?.message ?? err)}` };
            }
            if (!sourceActor || !parentActor) return { ok: false, error: 'actor create returned null' };

            try {
                // Source talent that the item-grant will copy onto the parent.
                const sourceCreated = await sourceActor.createEmbeddedDocuments('Item', [
                    {
                        name: 'probe-granted-talent',
                        type: 'talent',
                    },
                ]);
                const sourceTalent = sourceCreated[0];
                if (!sourceTalent?.uuid) return { ok: false, error: 'source talent has no uuid' };

                const parentCreated = await parentActor.createEmbeddedDocuments('Item', [
                    {
                        name: 'probe-parent-talent',
                        type: 'talent',
                        system: {
                            grantsV2: [
                                {
                                    _id: 'grantitem00000000',
                                    type: 'item',
                                    items: [{ uuid: sourceTalent.uuid, optional: false }],
                                },
                            ],
                        },
                    },
                ]);
                const parentTalent = parentCreated[0];
                if (!parentTalent) return { ok: false, error: 'parent talent create failed' };

                const mod = await import(moduleUrl);
                const Mgr = mod.GrantsManager ?? mod.default;
                const result = await Mgr.applyItemGrants(parentTalent, parentActor, { force: true });

                const grantedItems = parentActor.items?.contents?.filter((i: any) => i.name === 'probe-granted-talent') ?? [];
                if (grantedItems.length === 0) {
                    const errs = (result?.errors ?? []).join('; ');
                    return { ok: false, error: `granted item not on actor (errors: ${errs || '(none)'})` };
                }
                return { ok: true, error: null };
            } finally {
                try {
                    await sourceActor.delete();
                } catch {
                    /* best-effort */
                }
                try {
                    await parentActor.delete();
                } catch {
                    /* best-effort */
                }
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
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
        async ({ actorId, moduleUrl }): Promise<FlowResult> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe */
            const g = globalThis as any;
            const actor = g.game?.actors?.get?.(actorId);
            if (!actor) return { ok: false, error: 'actor missing' };

            let talent: any;
            try {
                const created = await actor.createEmbeddedDocuments('Item', [
                    {
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
                    },
                ]);
                talent = created[0];
            } catch (err) {
                return { ok: false, error: `talent create failed: ${String((err as Error)?.message ?? err)}` };
            }
            if (!talent) return { ok: false, error: 'talent create returned null' };

            try {
                const mod = await import(moduleUrl);
                const Mgr = mod.GrantsManager ?? mod.default;
                const sourceKey = talent.uuid ?? talent.id;

                await Mgr.applyItemGrants(talent, actor, { force: true });
                const hadBefore = Mgr.hasAppliedGrants(actor, sourceKey);
                if (!hadBefore) return { ok: false, error: 'hasAppliedGrants false after apply' };

                const reverseResult = await Mgr.reverseAppliedGrants(actor, sourceKey);
                if (!reverseResult?.success) {
                    return { ok: false, error: `reverse failed: ${(reverseResult?.errors ?? []).join('; ')}` };
                }

                const refreshed = g.game?.actors?.get?.(actorId);
                const stillTrained = Boolean(refreshed?.system?.skills?.awareness?.trained);
                const hasFlagAfter = Mgr.hasAppliedGrants(refreshed, sourceKey);
                if (hasFlagAfter) return { ok: false, error: 'applied-grants flag still set after reverse' };
                if (stillTrained) return { ok: false, error: 'awareness.trained still true after reverse' };
                return { ok: true, error: null };
            } finally {
                try {
                    await actor.deleteEmbeddedDocuments('Item', [talent.id]);
                } catch {
                    /* best-effort */
                }
                try {
                    await actor.update({ 'system.skills.awareness.trained': false });
                } catch {
                    /* best-effort */
                }
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
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
    return page.evaluate(async (actorId: string): Promise<FlowResult> => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe */
        const g = globalThis as any;
        const actor = g.game?.actors?.get?.(actorId);
        if (!actor) return { ok: false, error: 'actor missing' };

        let talent: any;
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
            talent = created[0];
        } catch (err) {
            return { ok: false, error: `talent create failed: ${String((err as Error)?.message ?? err)}` };
        }
        if (!talent) return { ok: false, error: 'talent create returned null' };

        try {
            const liveTalent = actor.items.get(talent.id);
            const abilities = (liveTalent?.system?.grants?.specialAbilities ?? []) as Array<{ name?: string }>;
            if (!Array.isArray(abilities) || abilities.length !== 1) {
                return { ok: false, error: `expected 1 specialAbility, got ${Array.isArray(abilities) ? abilities.length : 'non-array'}` };
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
                await actor.deleteEmbeddedDocuments('Item', [talent.id]);
            } catch {
                /* best-effort */
            }
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
    }, actorId);
}

/**
 * TransactionManager flow: with a buyer + a barter-mode source carrying a
 * gear item with cost + quantity, `commitTransaction` should
 *   - debit buyer.system.throneGelt by finalCost,
 *   - drop a copy of the item onto buyer.items.
 */
async function probeAcquire(page: Page, buyerId: string, sourceId: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ buyerId, sourceId, moduleUrl }): Promise<FlowResult> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe */
            const g = globalThis as any;
            const buyer = g.game?.actors?.get?.(buyerId);
            const source = g.game?.actors?.get?.(sourceId);
            if (!buyer || !source) return { ok: false, error: 'buyer/source missing' };

            const mod = await import(moduleUrl);
            const TM = mod.TransactionManager;
            if (typeof TM?.commitTransaction !== 'function') {
                return { ok: false, error: 'TransactionManager.commitTransaction unavailable' };
            }

            // Configure source as a barter shop and stock it.
            await TM.setMode(source, 'barter');
            const itemCreated = await source.createEmbeddedDocuments('Item', [
                {
                    name: 'probe-acquire-gear',
                    type: 'gear',
                    system: { cost: { value: 10 }, quantity: 3 },
                },
            ]);
            const item = itemCreated[0];
            if (!item) return { ok: false, error: 'source item create failed' };

            // Give buyer enough throneGelt.
            await buyer.update({ 'system.throneGelt': 100 });
            const beforeGelt = Number(g.game.actors.get(buyerId)?.system?.throneGelt ?? 0);

            try {
                await TM.commitTransaction({
                    buyerActorId: buyerId,
                    sourceActorId: sourceId,
                    itemId: item.id,
                    quantity: 1,
                    influenceBurn: 0,
                });
            } catch (err) {
                return { ok: false, error: `commitTransaction threw: ${String((err as Error)?.message ?? err)}` };
            }

            const refreshedBuyer = g.game.actors.get(buyerId);
            const afterGelt = Number(refreshedBuyer?.system?.throneGelt ?? 0);
            const acquired = refreshedBuyer?.items?.contents?.find((i: any) => i.name === 'probe-acquire-gear');

            const ok = afterGelt === beforeGelt - 10 && acquired !== undefined;
            return {
                ok,
                error: ok
                    ? null
                    : `expected buyer gelt ${beforeGelt - 10} and item present, got gelt=${afterGelt}, item=${acquired ? 'yes' : 'no'}`,
            };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { buyerId, sourceId, moduleUrl: TRANSACTION_MODULE_URL },
    );
}

/**
 * TransactionManager flow (sell direction): the manager has no
 * dedicated "sell" entry point — selling is modelled as the same
 * commitTransaction call with buyer + source swapped (the PC becomes
 * the source if they were configured as one). To exercise the symmetric
 * code path without bending the data model, we run a second
 * commitTransaction in the OPPOSITE direction: source actor (still in
 * barter mode) buys an item back from the buyer-turned-source. This
 * verifies that the item-transfer + currency-update path is bidirectional.
 */
async function probeSell(page: Page, buyerId: string, sourceId: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ buyerId, sourceId, moduleUrl }): Promise<FlowResult> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe */
            const g = globalThis as any;
            const buyer = g.game?.actors?.get?.(buyerId);
            const source = g.game?.actors?.get?.(sourceId);
            if (!buyer || !source) return { ok: false, error: 'buyer/source missing' };

            const mod = await import(moduleUrl);
            const TM = mod.TransactionManager;

            // Flip roles: buyer becomes the source (configure as barter),
            // original source becomes the buyer.
            await TM.setMode(buyer, 'barter');
            const stocked = await buyer.createEmbeddedDocuments('Item', [
                {
                    name: 'probe-sell-gear',
                    type: 'gear',
                    system: { cost: { value: 5 }, quantity: 1 },
                },
            ]);
            const item = stocked[0];
            if (!item) return { ok: false, error: 'item create on buyer-as-source failed' };

            await source.update({ 'system.throneGelt': 50 });
            const beforeOriginalSourceGelt = Number(g.game.actors.get(sourceId)?.system?.throneGelt ?? 0);

            try {
                await TM.commitTransaction({
                    buyerActorId: sourceId,
                    sourceActorId: buyerId,
                    itemId: item.id,
                    quantity: 1,
                    influenceBurn: 0,
                });
            } catch (err) {
                return { ok: false, error: `commitTransaction threw: ${String((err as Error)?.message ?? err)}` };
            }

            const refreshedBuyer = g.game.actors.get(buyerId);
            const refreshedSource = g.game.actors.get(sourceId);
            const itemGone = !refreshedBuyer?.items?.contents?.some((i: any) => i.name === 'probe-sell-gear');
            const itemArrived = refreshedSource?.items?.contents?.some((i: any) => i.name === 'probe-sell-gear');
            const goldDebited = Number(refreshedSource?.system?.throneGelt ?? 0) === beforeOriginalSourceGelt - 5;

            // Reset the original buyer's mode so other flows aren't affected.
            try {
                await TM.setMode(buyer, 'none');
            } catch {
                /* best-effort */
            }

            const ok = itemGone && itemArrived === true && goldDebited;
            return {
                ok,
                error: ok ? null : `sell flow: itemGone=${itemGone}, itemArrived=${itemArrived === true}, goldDebited=${goldDebited}`,
            };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { buyerId, sourceId, moduleUrl: TRANSACTION_MODULE_URL },
    );
}

/**
 * TransactionManager flow: listSourcesForBuyer should return the
 * configured source actor when called from the buyer side.
 */
async function probeListSources(page: Page, buyerId: string, sourceId: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ buyerId, sourceId, moduleUrl }): Promise<FlowResult> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe */
            const g = globalThis as any;
            const buyer = g.game?.actors?.get?.(buyerId);
            const source = g.game?.actors?.get?.(sourceId);
            if (!buyer || !source) return { ok: false, error: 'buyer/source missing' };

            const mod = await import(moduleUrl);
            const TM = mod.TransactionManager;

            // Ensure source is in barter mode (it might have been reset by
            // the sell probe).
            await TM.setMode(source, 'barter');

            const sources = TM.listSourcesForBuyer(buyer);
            if (!Array.isArray(sources)) return { ok: false, error: 'listSourcesForBuyer did not return an array' };

            const includesConfiguredSource = sources.some((s: any) => s.id === sourceId);
            if (!includesConfiguredSource) {
                const ids = sources.map((s: any) => s.id).join(', ');
                return { ok: false, error: `configured source missing from list (got ids: ${ids || '(empty)'})` };
            }

            // listItemsForSource should also be callable and return an array.
            const items = TM.listItemsForSource(source);
            if (!Array.isArray(items)) return { ok: false, error: 'listItemsForSource did not return an array' };

            return { ok: true, error: null };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { buyerId, sourceId, moduleUrl: TRANSACTION_MODULE_URL },
    );
}

test.describe.serial('grants-manager + transaction-manager (Tier B)', () => {
    test('every manager flow lands the expected state mutation', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        // Single fixture pair reused across flows where possible. Grants
        // flows operate on `grantsActor`; transaction flows operate on the
        // buyer + source pair.
        const grantsParent = await createCharacterActor(page, 'probe-managers-grants-parent');
        expect('id' in grantsParent, `grants parent create failed: ${'error' in grantsParent ? grantsParent.error : 'unknown'}`).toBe(true);
        const grantsActorId = (grantsParent as ActorRef).id;

        const buyer = await createCharacterActor(page, 'probe-managers-buyer');
        expect('id' in buyer, `buyer create failed: ${'error' in buyer ? buyer.error : 'unknown'}`).toBe(true);
        const buyerId = (buyer as ActorRef).id;

        const source = await createCharacterActor(page, 'probe-managers-source');
        expect('id' in source, `source create failed: ${'error' in source ? source.error : 'unknown'}`).toBe(true);
        const sourceId = (source as ActorRef).id;

        const failures: string[] = [];
        try {
            const probes: Array<{ flow: string; run: () => Promise<FlowResult> }> = [
                { flow: FLOW_TALENT_SKILL, run: () => probeGrantsSkill(page, grantsActorId) },
                { flow: FLOW_TALENT_TALENT, run: () => probeGrantsTalentGrantsTalent(page) },
                { flow: FLOW_REVOKE, run: () => probeGrantsRevoke(page, grantsActorId) },
                { flow: FLOW_SPECIAL_ABILITY, run: () => probeSpecialAbility(page, grantsActorId) },
                { flow: FLOW_LIST_SOURCES, run: () => probeListSources(page, buyerId, sourceId) },
                { flow: FLOW_ACQUIRE, run: () => probeAcquire(page, buyerId, sourceId) },
                // probeSell mutates buyer/source modes; run last so it
                // doesn't affect FLOW_LIST_SOURCES / FLOW_ACQUIRE.
                { flow: FLOW_SELL, run: () => probeSell(page, buyerId, sourceId) },
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
            await deleteActor(page, buyerId);
            await deleteActor(page, sourceId);
        }

        expect(failures, `${failures.length} manager flow(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
