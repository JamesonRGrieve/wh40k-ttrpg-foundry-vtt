import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * DH2 (Dark Heresy 2e)-specific gameplay flows. Exercises DH2 character
 * resource tracks (fate / corruption / insanity), the originPath item type
 * (with DH2 step values), and a read from the DH2 elite-advance compendium
 * pack. Source coverage falls onto:
 *   - src/module/data/actor/concrete/dh2-character.ts
 *   - src/module/data/actor/character.ts (insanity / corruption fields)
 *   - src/module/data/actor/templates/creature.ts (fate field)
 *   - src/module/data/item/origin-path.ts
 *
 * Each test joins as GM, performs the probe via page.evaluate, and collects
 * failures so all sub-assertions surface in a single assertion message.
 */

interface PageWindow {
    Actor?: {
        create?: (data: object) => Promise<{
            id?: string;
            system?: Record<string, unknown>;
            update?: (data: object) => Promise<unknown>;
            createEmbeddedDocuments?: (kind: string, data: object[]) => Promise<Array<{ id: string }>>;
            items?: {
                contents: Array<{ id: string; type: string; system?: Record<string, unknown> }>;
                get?: (id: string) => { id: string; type: string; system?: Record<string, unknown> } | undefined;
            };
            delete?: () => Promise<unknown>;
        } | null>;
    };
    game?: {
        packs?: {
            get?: (id: string) =>
                | {
                      metadata?: { type?: string };
                      getDocuments?: () => Promise<Array<{ id?: string; name?: string; type?: string; system?: Record<string, unknown> }>>;
                  }
                | undefined;
        };
    };
}

async function createDH2Character(page: Page, label: string): Promise<{ id: string | null; createError: string | null }> {
    return page.evaluate(async (name: string) => {
        const { Actor: ActorCls } = globalThis as unknown as PageWindow;
        if (!ActorCls?.create) return { id: null, createError: 'Actor.create unavailable' };
        try {
            const actor = await ActorCls.create({
                name,
                type: 'dh2-character',
                system: { gameSystem: 'dh2e' },
            });
            return { id: actor?.id ?? null, createError: actor ? null : 'Actor.create returned null' };
        } catch (err) {
            return { id: null, createError: err instanceof Error ? err.message : String(err) };
        }
    }, label);
}

async function deleteActor(page: Page, id: string): Promise<void> {
    await page.evaluate(async (actorId: string) => {
        const { game: gameObj } = globalThis as unknown as { game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } } };
        try {
            await gameObj?.actors?.get?.(actorId)?.delete?.();
        } catch {
            /* ignore */
        }
    }, id);
}

test.describe.serial('dh2 flows (Tier B)', () => {
    test('dh2-character fate track persists updates', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createDH2Character(page, 'dh2-fate-probe');
        if (created.id === null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => { system?: { fate?: { value: number; max: number } }; update?: (data: object) => Promise<unknown> } | undefined;
                    };
                };
            };
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            const initial = actor.system?.fate?.value ?? null;
            try {
                await actor.update?.({ 'system.fate.max': 3, 'system.fate.value': 3 });
            } catch (err) {
                return { error: `set fate=3: ${err instanceof Error ? err.message : String(err)}` };
            }
            const after3 = (gameObj?.actors?.get?.(actorId) as { system?: { fate?: { value: number } } } | undefined)?.system?.fate?.value ?? null;
            try {
                await actor.update?.({ 'system.fate.value': 2 });
            } catch (err) {
                return { error: `spend fate: ${err instanceof Error ? err.message : String(err)}` };
            }
            const afterSpend = (gameObj?.actors?.get?.(actorId) as { system?: { fate?: { value: number } } } | undefined)?.system?.fate?.value ?? null;
            return { initial, after3, afterSpend, error: null };
        }, created.id);

        if (result.error !== null) failures.push(result.error);
        else {
            if (result.after3 !== 3) failures.push(`fate.value after set=3 was ${result.after3}, expected 3`);
            if (result.afterSpend !== 2) failures.push(`fate.value after spend was ${result.afterSpend}, expected 2`);
            if (failures.length === 0) recordCoverage('dh2.fate', 'fate-track');
        }

        await deleteActor(page, created.id);
        expect(failures, `dh2 fate failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('dh2-character corruption track persists updates', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createDH2Character(page, 'dh2-corruption-probe');
        if (created.id === null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as {
                game?: { actors?: { get?: (id: string) => { system?: { corruption?: number }; update?: (data: object) => Promise<unknown> } | undefined } };
            };
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            const initial = actor.system?.corruption ?? null;
            try {
                await actor.update?.({ 'system.corruption': 12 });
            } catch (err) {
                return { error: `set corruption: ${err instanceof Error ? err.message : String(err)}` };
            }
            const after = gameObj?.actors?.get?.(actorId)?.system?.corruption ?? null;
            return { initial, after, error: null };
        }, created.id);

        if (result.error !== null) failures.push(result.error);
        else {
            if (result.after !== 12) failures.push(`corruption after set was ${result.after}, expected 12`);
            if (failures.length === 0) recordCoverage('dh2.corruption', 'corruption-track');
        }

        await deleteActor(page, created.id);
        expect(failures, `dh2 corruption failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('dh2-character insanity track persists updates', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createDH2Character(page, 'dh2-insanity-probe');
        if (created.id === null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as {
                game?: { actors?: { get?: (id: string) => { system?: { insanity?: number }; update?: (data: object) => Promise<unknown> } | undefined } };
            };
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            const initial = actor.system?.insanity ?? null;
            try {
                await actor.update?.({ 'system.insanity': 7 });
            } catch (err) {
                return { error: `set insanity: ${err instanceof Error ? err.message : String(err)}` };
            }
            const after = gameObj?.actors?.get?.(actorId)?.system?.insanity ?? null;
            return { initial, after, error: null };
        }, created.id);

        if (result.error !== null) failures.push(result.error);
        else {
            if (result.after !== 7) failures.push(`insanity after set was ${result.after}, expected 7`);
            if (failures.length === 0) recordCoverage('dh2.insanity', 'insanity-track');
        }

        await deleteActor(page, created.id);
        expect(failures, `dh2 insanity failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('dh2 origin-path item embeds onto dh2-character', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createDH2Character(page, 'dh2-origin-probe');
        if (created.id === null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) =>
                            | {
                                  createEmbeddedDocuments?: (kind: string, data: object[]) => Promise<Array<{ id: string }>>;
                                  items?: { contents: Array<{ id: string; type: string; system?: Record<string, unknown> }> };
                              }
                            | undefined;
                    };
                };
            };
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            try {
                await actor.createEmbeddedDocuments?.('Item', [
                    {
                        name: 'probe-origin-background',
                        type: 'originPath',
                        system: {
                            gameSystem: 'dh2e',
                            step: 'background',
                            stepIndex: 1,
                            positions: [4],
                        },
                    },
                ]);
            } catch (err) {
                return { error: `create origin: ${err instanceof Error ? err.message : String(err)}` };
            }
            const items = actor.items?.contents ?? [];
            const origin = items.find((i) => i.type === 'originPath');
            if (!origin) return { error: 'origin item not found after create' };
            const sys = origin.system as { step?: string; stepIndex?: number; gameSystem?: string; positions?: number[] } | undefined;
            return {
                step: sys?.step ?? null,
                stepIndex: sys?.stepIndex ?? null,
                gameSystem: sys?.gameSystem ?? null,
                positionsLen: sys?.positions?.length ?? null,
                error: null,
            };
        }, created.id);

        if (result.error !== null) failures.push(result.error);
        else {
            if (result.step !== 'background') failures.push(`origin.step was ${result.step}, expected 'background'`);
            if (result.stepIndex !== 1) failures.push(`origin.stepIndex was ${result.stepIndex}, expected 1`);
            if (result.gameSystem !== 'dh2e') failures.push(`origin.gameSystem was ${result.gameSystem}, expected 'dh2e'`);
            if (result.positionsLen !== 1) failures.push(`origin.positions length was ${result.positionsLen}, expected 1`);
            if (failures.length === 0) recordCoverage('dh2.origin-path', 'create-and-embed');
        }

        await deleteActor(page, created.id);
        expect(failures, `dh2 origin-path failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('dh2 elite-advance compendium pack is readable', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const result = await page.evaluate(async () => {
            const { game: gameObj } = globalThis as unknown as PageWindow;
            const pack = gameObj?.packs?.get?.('wh40k-rpg.dh2-core-stats-elite-advances');
            if (!pack) return { error: 'pack not found' };
            const packType = pack.metadata?.type ?? null;
            let docs: Array<{ id?: string; name?: string; type?: string; system?: Record<string, unknown> }> = [];
            try {
                docs = (await pack.getDocuments?.()) ?? [];
            } catch (err) {
                return { error: `getDocuments: ${err instanceof Error ? err.message : String(err)}` };
            }
            const sample = docs[0];
            const sampleStep = sample.system?.['step'] ?? null;
            const sampleGameSystem = sample.system?.['gameSystem'] ?? null;
            return {
                packType,
                docCount: docs.length,
                sampleName: sample.name ?? null,
                sampleType: sample.type ?? null,
                sampleStep,
                sampleGameSystem,
                error: null,
            };
        });

        if (result.error !== null) failures.push(result.error);
        else {
            if (result.packType !== 'Item') failures.push(`pack.metadata.type was ${result.packType}, expected 'Item'`);
            if (result.docCount === 0) failures.push('pack contained no documents');
            if (result.sampleType !== 'originPath') failures.push(`sample doc type was ${result.sampleType}, expected 'originPath'`);
            if (result.sampleStep !== 'elite') failures.push(`sample doc step was ${JSON.stringify(result.sampleStep)}, expected 'elite'`);
            if (failures.length === 0) recordCoverage('dh2.elite-advance', 'compendium-read');
        }

        expect(failures, `dh2 elite-advance failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
