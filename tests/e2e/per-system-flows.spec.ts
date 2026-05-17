import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Per-system gameplay flows for the 5 non-DH2 FFG-family systems. Exercises
 * the system-specific surfaces that each per-system concrete data model
 * inherits / extends from CharacterBaseData. Source coverage falls onto:
 *   - src/module/data/actor/concrete/bc-character.ts (chaosAlignment write path)
 *   - src/module/data/actor/concrete/dh1-character.ts (corruption + insanity)
 *   - src/module/data/actor/concrete/dw-character.ts (originPath.chapter)
 *   - src/module/data/actor/concrete/ow-character.ts (originPath.regiment)
 *   - src/module/data/actor/concrete/rt-character.ts (rogueTrader.profitFactor)
 *   - src/module/data/actor/character.ts (the shared base schema fields)
 *   - src/module/config/game-systems/{bc,dh1e,dw,ow,rt}-config.ts (gameSystem
 *     dispatch, per-system theme classFor lookups triggered on actor create)
 *
 * Field notes (what the prompt asked for vs. what actually exists in the
 * schema today):
 *   - BC infamy: there is NO actor-level `infamy` field on CharacterBaseData
 *     (infamy exists only as a per-item cost slot on physical-item-template).
 *     The signature BC mechanic that IS on the actor is `chaosAlignment`.
 *   - DW renown: there is NO actor-level `renown` field. The signature DW
 *     mechanic that IS on the actor is `originPath.chapter`.
 *   - OW comrades / regimentalComposition: there are NO actor-level
 *     `comrades` or `regimentalComposition` fields. The signature OW
 *     mechanic that IS on the actor is `originPath.regiment`.
 *   - RT dynasty: there is no separate `dynasty` schema field, but
 *     `rogueTrader.endeavour` is the closest dynasty-shaped surface and is
 *     exercised here alongside profitFactor.
 *
 * When (if) those missing fields are added to the data model, the
 * test.skip() calls below should be promoted to real probes and the
 * PER_SYSTEM_FLOWS inventory in scripts/e2e-coverage.mjs extended.
 *
 * Each test joins as GM, performs the probe via page.evaluate, and collects
 * failures so all sub-assertions surface in a single assertion message.
 */

interface ActorHandle {
    id?: string;
    system?: Record<string, unknown>;
    update?: (data: object) => Promise<unknown>;
    delete?: () => Promise<unknown>;
}

interface PageWindow {
    Actor?: {
        create?: (data: object) => Promise<ActorHandle | null>;
    };
    game?: {
        actors?: {
            get?: (id: string) => ActorHandle | undefined;
        };
    };
}

async function createActor(
    page: import('@playwright/test').Page,
    label: string,
    actorType: string,
    gameSystem: string,
): Promise<{ id: string | null; createError: string | null }> {
    return page.evaluate(
        async ({ name, type, sys }: { name: string; type: string; sys: string }) => {
            const { Actor } = globalThis as unknown as PageWindow;
            if (!Actor?.create) return { id: null, createError: 'Actor.create unavailable' };
            try {
                const actor = await Actor.create({ name, type, system: { gameSystem: sys } });
                return { id: actor?.id ?? null, createError: actor ? null : 'Actor.create returned null' };
            } catch (err) {
                return { id: null, createError: String((err as Error)?.message ?? err) };
            }
        },
        { name: label, type: actorType, sys: gameSystem },
    );
}

async function deleteActor(page: import('@playwright/test').Page, id: string): Promise<void> {
    await page.evaluate(async (actorId: string) => {
        const { game } = globalThis as unknown as PageWindow;
        try {
            await game?.actors?.get?.(actorId)?.delete?.();
        } catch {
            /* ignore */
        }
    }, id);
}

test.describe.serial('per-system flows (Tier B)', () => {
    test('bc-character chaosAlignment write persists (infamy-shaped surface)', async ({ page }) => {
        // NOTE: BC Infamy track is not a schema field on CharacterBaseData;
        // chaosAlignment is the signature BC mechanic that IS present. If
        // `infamy` is added to the actor schema later, add a sibling probe.
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createActor(page, 'bc-infamy-probe', 'bc-character', 'bc');
        if (!created.id) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game } = globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => { system?: { chaosAlignment?: string }; update?: (data: object) => Promise<unknown> } | undefined;
                    };
                };
            };
            const actor = game?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            const initial = actor.system?.chaosAlignment ?? null;
            try {
                await actor.update?.({ 'system.chaosAlignment': 'khorne' });
            } catch (err) {
                return { error: `set chaosAlignment=khorne: ${String((err as Error)?.message ?? err)}` };
            }
            const afterKhorne = (game?.actors?.get?.(actorId) as { system?: { chaosAlignment?: string } } | undefined)?.system?.chaosAlignment ?? null;
            try {
                await actor.update?.({ 'system.chaosAlignment': 'tzeentch' });
            } catch (err) {
                return { error: `set chaosAlignment=tzeentch: ${String((err as Error)?.message ?? err)}` };
            }
            const afterTzeentch = (game?.actors?.get?.(actorId) as { system?: { chaosAlignment?: string } } | undefined)?.system?.chaosAlignment ?? null;
            return { initial, afterKhorne, afterTzeentch, error: null };
        }, created.id);

        if (result.error) failures.push(result.error);
        else {
            if (result.initial !== 'unaligned') failures.push(`initial chaosAlignment was ${result.initial}, expected 'unaligned'`);
            if (result.afterKhorne !== 'khorne') failures.push(`chaosAlignment after set was ${result.afterKhorne}, expected 'khorne'`);
            if (result.afterTzeentch !== 'tzeentch') failures.push(`chaosAlignment after second set was ${result.afterTzeentch}, expected 'tzeentch'`);
            if (failures.length === 0) recordCoverage('per-system.flow', 'bc-infamy');
        }

        await deleteActor(page, created.id);
        expect(failures, `bc chaosAlignment failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('dh1-character corruption + insanity tracks persist updates', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createActor(page, 'dh1-corruption-insanity-probe', 'dh1-character', 'dh1e');
        if (!created.id) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game } = globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => { system?: { corruption?: number; insanity?: number }; update?: (data: object) => Promise<unknown> } | undefined;
                    };
                };
            };
            const actor = game?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            try {
                await actor.update?.({ 'system.corruption': 8, 'system.insanity': 15 });
            } catch (err) {
                return { error: `set corruption+insanity: ${String((err as Error)?.message ?? err)}` };
            }
            const after = game?.actors?.get?.(actorId)?.system as { corruption?: number; insanity?: number } | undefined;
            return { afterCorruption: after?.corruption ?? null, afterInsanity: after?.insanity ?? null, error: null };
        }, created.id);

        if (result.error) failures.push(result.error);
        else {
            if (result.afterCorruption !== 8) failures.push(`corruption after set was ${result.afterCorruption}, expected 8`);
            if (result.afterInsanity !== 15) failures.push(`insanity after set was ${result.afterInsanity}, expected 15`);
            if (failures.length === 0) recordCoverage('per-system.flow', 'dh1-corruption-insanity');
        }

        await deleteActor(page, created.id);
        expect(failures, `dh1 corruption+insanity failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('dw-character originPath.chapter persists (renown-shaped surface)', async ({ page }) => {
        // NOTE: DW Renown is not a schema field on CharacterBaseData;
        // originPath.chapter is the signature DW mechanic that IS present.
        // If `renown` is added to the actor schema later, add a sibling probe.
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createActor(page, 'dw-renown-chapter-probe', 'dw-character', 'dw');
        if (!created.id) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game } = globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => { system?: { originPath?: { chapter?: string; chapterUuid?: string } }; update?: (data: object) => Promise<unknown> } | undefined;
                    };
                };
            };
            const actor = game?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            try {
                await actor.update?.({ 'system.originPath.chapter': 'Ultramarines', 'system.originPath.chapterUuid': 'Compendium.wh40k-rpg.dw-core-chapters.Item.placeholder' });
            } catch (err) {
                return { error: `set chapter: ${String((err as Error)?.message ?? err)}` };
            }
            const after = game?.actors?.get?.(actorId)?.system?.originPath as { chapter?: string; chapterUuid?: string } | undefined;
            return { afterChapter: after?.chapter ?? null, afterChapterUuid: after?.chapterUuid ?? null, error: null };
        }, created.id);

        if (result.error) failures.push(result.error);
        else {
            if (result.afterChapter !== 'Ultramarines') failures.push(`chapter after set was ${result.afterChapter}, expected 'Ultramarines'`);
            if (result.afterChapterUuid !== 'Compendium.wh40k-rpg.dw-core-chapters.Item.placeholder')
                failures.push(`chapterUuid after set was ${result.afterChapterUuid}, expected the placeholder UUID`);
            if (failures.length === 0) recordCoverage('per-system.flow', 'dw-renown-and-chapter');
        }

        await deleteActor(page, created.id);
        expect(failures, `dw chapter failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('ow-character originPath.regiment persists (comrades-shaped surface)', async ({ page }) => {
        // NOTE: OW Comrades / regimentalComposition are not schema fields on
        // CharacterBaseData; originPath.regiment is the signature OW mechanic
        // that IS present. If a `comrades` field is added later, add a
        // sibling probe.
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createActor(page, 'ow-comrades-regiment-probe', 'ow-character', 'ow');
        if (!created.id) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game } = globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => { system?: { originPath?: { regiment?: string; speciality?: string } }; update?: (data: object) => Promise<unknown> } | undefined;
                    };
                };
            };
            const actor = game?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            try {
                await actor.update?.({ 'system.originPath.regiment': 'Cadian Shock Troopers', 'system.originPath.speciality': 'Heavy Gunner' });
            } catch (err) {
                return { error: `set regiment+speciality: ${String((err as Error)?.message ?? err)}` };
            }
            const after = game?.actors?.get?.(actorId)?.system?.originPath as { regiment?: string; speciality?: string } | undefined;
            return { afterRegiment: after?.regiment ?? null, afterSpeciality: after?.speciality ?? null, error: null };
        }, created.id);

        if (result.error) failures.push(result.error);
        else {
            if (result.afterRegiment !== 'Cadian Shock Troopers') failures.push(`regiment after set was ${result.afterRegiment}, expected 'Cadian Shock Troopers'`);
            if (result.afterSpeciality !== 'Heavy Gunner') failures.push(`speciality after set was ${result.afterSpeciality}, expected 'Heavy Gunner'`);
            if (failures.length === 0) recordCoverage('per-system.flow', 'ow-comrades-and-regiment');
        }

        await deleteActor(page, created.id);
        expect(failures, `ow regiment failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('rt-character profitFactor + endeavour persist (dynasty-shaped surface)', async ({ page }) => {
        // NOTE: There is no dedicated `dynasty` schema field; rogueTrader.
        // endeavour is the closest dynasty-shaped surface (a named campaign
        // arc with achievement progress and reward) and is exercised
        // alongside profitFactor.
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createActor(page, 'rt-profit-dynasty-probe', 'rt-character', 'rt');
        if (!created.id) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game } = globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (
                            id: string,
                        ) =>
                            | {
                                  system?: {
                                      rogueTrader?: {
                                          profitFactor?: { current?: number; starting?: number; modifier?: number };
                                          endeavour?: { name?: string; achievementCurrent?: number; achievementRequired?: number; reward?: number };
                                      };
                                  };
                                  update?: (data: object) => Promise<unknown>;
                              }
                            | undefined;
                    };
                };
            };
            const actor = game?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            try {
                await actor.update?.({
                    'system.rogueTrader.profitFactor.current': 42,
                    'system.rogueTrader.profitFactor.starting': 35,
                    'system.rogueTrader.profitFactor.modifier': 7,
                    'system.rogueTrader.endeavour.name': 'House Aurelius Reclamation',
                    'system.rogueTrader.endeavour.achievementCurrent': 3,
                    'system.rogueTrader.endeavour.achievementRequired': 10,
                    'system.rogueTrader.endeavour.reward': 5,
                });
            } catch (err) {
                return { error: `set rogueTrader fields: ${String((err as Error)?.message ?? err)}` };
            }
            const after = game?.actors?.get?.(actorId)?.system?.rogueTrader;
            return {
                pfCurrent: after?.profitFactor?.current ?? null,
                pfStarting: after?.profitFactor?.starting ?? null,
                pfModifier: after?.profitFactor?.modifier ?? null,
                endName: after?.endeavour?.name ?? null,
                endCurrent: after?.endeavour?.achievementCurrent ?? null,
                endRequired: after?.endeavour?.achievementRequired ?? null,
                endReward: after?.endeavour?.reward ?? null,
                error: null,
            };
        }, created.id);

        if (result.error) failures.push(result.error);
        else {
            if (result.pfCurrent !== 42) failures.push(`profitFactor.current was ${result.pfCurrent}, expected 42`);
            if (result.pfStarting !== 35) failures.push(`profitFactor.starting was ${result.pfStarting}, expected 35`);
            if (result.pfModifier !== 7) failures.push(`profitFactor.modifier was ${result.pfModifier}, expected 7`);
            if (result.endName !== 'House Aurelius Reclamation')
                failures.push(`endeavour.name was ${result.endName}, expected 'House Aurelius Reclamation'`);
            if (result.endCurrent !== 3) failures.push(`endeavour.achievementCurrent was ${result.endCurrent}, expected 3`);
            if (result.endRequired !== 10) failures.push(`endeavour.achievementRequired was ${result.endRequired}, expected 10`);
            if (result.endReward !== 5) failures.push(`endeavour.reward was ${result.endReward}, expected 5`);
            if (failures.length === 0) recordCoverage('per-system.flow', 'rt-profit-factor-and-dynasty');
        }

        await deleteActor(page, created.id);
        expect(failures, `rt profitFactor+endeavour failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
