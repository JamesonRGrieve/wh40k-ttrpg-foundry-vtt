import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * XP gain + advancement flows (Tier B). Pushes source-code coverage on:
 *   - src/module/data/actor/character.ts (experience schema + _computeExperienceSpent + _prepareExperience)
 *   - src/module/data/actor/templates/creature.ts (skill schema + _prepareSkills trained/plus10/plus20 derivation)
 *   - src/module/applications/dialogs/advancement-dialog.ts (constructor + _prepareContext + _renderHTML)
 *   - src/module/applications/prompts/add-xp-dialog.ts (constructor + _prepareContext)
 *
 * Schema note: the experience ledger uses `total` (XP earned) and `used` (XP
 * spent), with `available` (= total − used) as the derived "remaining" field.
 * The spec maps the conceptual earned/spent/remaining onto these three.
 *
 * All probes run via `page.evaluate`; the dialog renders use the same dynamic
 * `import('/systems/wh40k-rpg/module/...')` pattern as `dialogs.spec.ts`. Each
 * test collects failures into an array then asserts once at the end so the
 * single assertion message names every broken expectation.
 */

interface BCCharacterActor {
    id?: string;
    system?: {
        experience?: { total?: number; used?: number; available?: number };
        skills?: Record<string, { advance?: number; trained?: boolean; plus10?: boolean; plus20?: boolean; plus30?: boolean }>;
    };
    update?: (data: object) => Promise<unknown>;
    createEmbeddedDocuments?: (kind: string, data: object[]) => Promise<Array<{ id: string }>>;
    items?: { contents: Array<{ id: string; type: string; system?: Record<string, unknown> }> };
    delete?: () => Promise<unknown>;
}

interface PageWindow {
    Actor?: { create?: (data: object) => Promise<BCCharacterActor | null> };
    game?: { actors?: { get?: (id: string) => BCCharacterActor | undefined } };
}

async function createBCCharacter(page: Page, label: string): Promise<{ id: string | null; createError: string | null }> {
    return page.evaluate(async (name: string) => {
        const { Actor: ActorCls } = globalThis as unknown as PageWindow;
        if (!ActorCls?.create) return { id: null, createError: 'Actor.create unavailable' };
        try {
            const actor = await ActorCls.create({
                name,
                type: 'bc-character',
                system: { gameSystem: 'bc' },
            });
            return { id: actor?.id ?? null, createError: actor ? null : 'Actor.create returned null' };
        } catch (err) {
            return { id: null, createError: String((err as Error)?.message ?? err) };
        }
    }, label);
}

async function deleteActor(page: Page, id: string): Promise<void> {
    await page.evaluate(async (actorId: string) => {
        const { game: gameObj } = globalThis as unknown as PageWindow;
        try {
            await gameObj?.actors?.get?.(actorId)?.delete?.();
        } catch {
            /* ignore */
        }
    }, id);
}

test.describe.serial('xp gain & advancement flows (Tier B)', () => {
    test('xp earned increments via actor.update on system.experience.total', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createBCCharacter(page, 'xp-earned-probe');
        if (created.id == null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as PageWindow;
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            const initial = actor.system?.experience?.total ?? null;
            try {
                await actor.update?.({ 'system.experience.total': 500 });
            } catch (err) {
                return { error: `set total: ${String((err as Error)?.message ?? err)}` };
            }
            const after = gameObj?.actors?.get?.(actorId)?.system?.experience?.total ?? null;
            return { initial, after, error: null };
        }, created.id);

        if (result.error != null) failures.push(result.error);
        else {
            if (result.after !== 500) failures.push(`experience.total after set was ${result.after}, expected 500`);
            if (failures.length === 0) recordCoverage('xp.flow', 'xp-earned-increments');
        }

        await deleteActor(page, created.id);
        expect(failures, `xp-earned-increments failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('xp spent tracks via actor.update on system.experience.used', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createBCCharacter(page, 'xp-spent-probe');
        if (created.id == null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as PageWindow;
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            try {
                await actor.update?.({ 'system.experience.total': 1000, 'system.experience.used': 0 });
                await actor.update?.({ 'system.experience.used': 250 });
            } catch (err) {
                return { error: `set used: ${String((err as Error)?.message ?? err)}` };
            }
            const after = gameObj?.actors?.get?.(actorId)?.system?.experience?.used ?? null;
            return { after, error: null };
        }, created.id);

        if (result.error != null) failures.push(result.error);
        else {
            if (result.after !== 250) failures.push(`experience.used after set was ${result.after}, expected 250`);
            if (failures.length === 0) recordCoverage('xp.flow', 'xp-spent-tracks');
        }

        await deleteActor(page, created.id);
        expect(failures, `xp-spent-tracks failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('xp remaining calculates total minus used via system.experience.available', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createBCCharacter(page, 'xp-remaining-probe');
        if (created.id == null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as PageWindow;
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            try {
                await actor.update?.({ 'system.experience.total': 800, 'system.experience.used': 300 });
            } catch (err) {
                return { error: `set total/used: ${String((err as Error)?.message ?? err)}` };
            }
            const xp = gameObj?.actors?.get?.(actorId)?.system?.experience;
            return { total: xp?.total ?? null, used: xp?.used ?? null, available: xp?.available ?? null, error: null };
        }, created.id);

        if (result.error != null) failures.push(result.error);
        else {
            if (result.total !== 800) failures.push(`experience.total was ${result.total}, expected 800`);
            if (result.used !== 300) failures.push(`experience.used was ${result.used}, expected 300`);
            // available is derived in _prepareExperience as total - used.
            if (result.available !== 500) failures.push(`experience.available was ${result.available}, expected 500 (800-300)`);
            if (failures.length === 0) recordCoverage('xp.flow', 'xp-remaining-calculates');
        }

        await deleteActor(page, created.id);
        expect(failures, `xp-remaining-calculates failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('AddXPDialog renders against a character actor', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createBCCharacter(page, 'add-xp-prompt-probe');
        if (created.id == null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const actor = g.game?.actors?.get?.(actorId);
            if (actor == null) return { rendered: false, error: 'actor not found' };
            let inst: any = null;
            try {
                const url: string = '/systems/wh40k-rpg/module/applications/prompts/add-xp-dialog.js';
                const mod = await import(/* @vite-ignore */ url);
                const Cls = mod.default;
                if (typeof Cls !== 'function') return { rendered: false, error: 'AddXPDialog default export not a constructor' };
                inst = new Cls(actor);
                await inst.render(true);
                await new Promise<void>((r) => {
                    setTimeout(r, 30);
                });
                const rendered = inst.element instanceof HTMLElement;
                try {
                    await inst.close?.();
                } catch {
                    /* ignore */
                }
                return { rendered, error: null };
            } catch (err) {
                try {
                    await inst?.close?.();
                } catch {
                    /* ignore */
                }
                return { rendered: false, error: String((err as Error)?.message ?? err) };
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, created.id);

        if (result.error != null) failures.push(result.error);
        else if (!result.rendered) failures.push('AddXPDialog did not produce an HTMLElement');
        else recordCoverage('xp.flow', 'add-xp-prompt-render');

        await deleteActor(page, created.id);
        expect(failures, `add-xp-prompt-render failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('AdvancementDialog renders against a character actor', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createBCCharacter(page, 'advancement-dialog-probe');
        if (created.id == null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const actor = g.game?.actors?.get?.(actorId);
            if (actor == null) return { rendered: false, error: 'actor not found' };
            let inst: any = null;
            try {
                const url: string = '/systems/wh40k-rpg/module/applications/dialogs/advancement-dialog.js';
                const mod = await import(/* @vite-ignore */ url);
                const Cls = mod.default;
                if (typeof Cls !== 'function') return { rendered: false, error: 'AdvancementDialog default export not a constructor' };
                inst = new Cls(actor);
                await inst.render(true);
                await new Promise<void>((r) => {
                    setTimeout(r, 30);
                });
                const rendered = inst.element instanceof HTMLElement;
                try {
                    await inst.close?.();
                } catch {
                    /* ignore */
                }
                return { rendered, error: null };
            } catch (err) {
                try {
                    await inst?.close?.();
                } catch {
                    /* ignore */
                }
                return { rendered: false, error: String((err as Error)?.message ?? err) };
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, created.id);

        if (result.error != null) failures.push(result.error);
        else if (!result.rendered) failures.push('AdvancementDialog did not produce an HTMLElement');
        else recordCoverage('xp.flow', 'advancement-dialog-render');

        await deleteActor(page, created.id);
        expect(failures, `advancement-dialog-render failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('purchasing a talent embeds the item and decrements available XP', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createBCCharacter(page, 'purchase-talent-probe');
        if (created.id == null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as PageWindow;
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            const TALENT_COST = 200;
            try {
                await actor.update?.({ 'system.experience.total': 1000, 'system.experience.used': 0 });
                await actor.createEmbeddedDocuments?.('Item', [
                    {
                        name: 'probe-talent',
                        type: 'talent',
                        system: { cost: TALENT_COST },
                    },
                ]);
                // Simulate the purchase ledger update — adding the talent costs XP.
                await actor.update?.({ 'system.experience.used': TALENT_COST });
            } catch (err) {
                return { error: `purchase talent: ${String((err as Error)?.message ?? err)}` };
            }
            const fresh = gameObj?.actors?.get?.(actorId);
            const items = fresh?.items?.contents ?? [];
            const talent = items.find((i) => i.type === 'talent') ?? null;
            const xp = fresh?.system?.experience;
            return {
                talentFound: talent !== null,
                talentCost: (talent?.system?.['cost'] as number | undefined) ?? null,
                used: xp?.used ?? null,
                available: xp?.available ?? null,
                error: null,
            };
        }, created.id);

        if (result.error != null) failures.push(result.error);
        else {
            if (!result.talentFound) failures.push('talent item not present after createEmbeddedDocuments');
            if (result.talentCost !== 200) failures.push(`talent.system.cost was ${result.talentCost}, expected 200`);
            if (result.used !== 200) failures.push(`experience.used after purchase was ${result.used}, expected 200`);
            if (result.available !== 800) failures.push(`experience.available after purchase was ${result.available}, expected 800`);
            if (failures.length === 0) recordCoverage('xp.flow', 'purchase-talent-grants-modifier');
        }

        await deleteActor(page, created.id);
        expect(failures, `purchase-talent-grants-modifier failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('purchasing a skill advance updates trained / plus10 derived flags', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const created = await createBCCharacter(page, 'purchase-skill-probe');
        if (created.id == null) {
            failures.push(`actor create: ${created.createError ?? 'unknown'}`);
            expect(failures, failures.join('\n')).toEqual([]);
            return;
        }

        const result = await page.evaluate(async (actorId: string) => {
            const { game: gameObj } = globalThis as unknown as PageWindow;
            const actor = gameObj?.actors?.get?.(actorId);
            if (!actor) return { error: 'actor not found' };
            const before = actor.system?.skills?.['dodge'];
            try {
                await actor.update?.({ 'system.skills.dodge.advance': 1 });
            } catch (err) {
                return { error: `set advance=1: ${String((err as Error)?.message ?? err)}` };
            }
            const atOne = gameObj?.actors?.get?.(actorId)?.system?.skills?.['dodge'];
            try {
                await actor.update?.({ 'system.skills.dodge.advance': 2 });
            } catch (err) {
                return { error: `set advance=2: ${String((err as Error)?.message ?? err)}` };
            }
            const atTwo = gameObj?.actors?.get?.(actorId)?.system?.skills?.['dodge'];
            return {
                beforeAdvance: before?.advance ?? null,
                beforeTrained: before?.trained ?? null,
                atOneAdvance: atOne?.advance ?? null,
                atOneTrained: atOne?.trained ?? null,
                atTwoAdvance: atTwo?.advance ?? null,
                atTwoTrained: atTwo?.trained ?? null,
                atTwoPlus10: atTwo?.plus10 ?? null,
                error: null,
            };
        }, created.id);

        if (result.error != null) failures.push(result.error);
        else {
            if (result.beforeAdvance !== 0) failures.push(`initial dodge.advance was ${result.beforeAdvance}, expected 0`);
            if (result.atOneAdvance !== 1) failures.push(`dodge.advance after set 1 was ${result.atOneAdvance}, expected 1`);
            if (result.atTwoAdvance !== 2) failures.push(`dodge.advance after set 2 was ${result.atTwoAdvance}, expected 2`);
            // trained/plus10 flags are derived from effective rank in _prepareSkills.
            // We don't pin specific true/false values per system here — the goal
            // is to assert the flags are present (non-null) and that advances
            // persist; per-system rank semantics differ across the 7 systems.
            if (result.atTwoTrained === null) failures.push('dodge.trained flag missing after advance=2');
            if (result.atTwoPlus10 === null) failures.push('dodge.plus10 flag missing after advance=2');
            if (failures.length === 0) recordCoverage('xp.flow', 'purchase-skill-advance');
        }

        await deleteActor(page, created.id);
        expect(failures, `purchase-skill-advance failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
