import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Data-driven coverage of every status effect declared via
 * `CONFIG.statusEffects`. For each effect ID:
 *   1. toggle it ON via `actor.toggleStatusEffect(id)`
 *   2. verify it lands (actor.statuses.has(id) or actor.effects search)
 *   3. toggle it OFF
 *   4. verify removal
 *
 * Pushes source-code coverage on `src/module/rules/active-effects.ts` and
 * the broader active-effect pipeline. Single parent actor is created up
 * front (bc-character — verified working by tier B actor-types sweep) and
 * deleted at the end.
 */

interface ConditionProbe {
    id: string;
    appliedOk: boolean;
    removedOk: boolean;
    pageErrors: string[];
    error: string | null;
}

interface ActorRef {
    id: string;
}

async function createParentActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const { Actor: ActorGlobal } = globalThis as unknown as {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        };
        if (!ActorGlobal?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await ActorGlobal.create({
                name: 'probe-conditions-parent',
                type: 'bc-character',
                system: { gameSystem: 'bc' },
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
        const { game: gameGlobal } = globalThis as unknown as {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        };
        const actor = gameGlobal?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

async function listStatusEffectIds(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const cfg = (globalThis as unknown as { CONFIG?: { statusEffects?: Array<{ id?: string }> } }).CONFIG;
        return (cfg?.statusEffects ?? []).map((s) => s.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
    });
}

async function probeStatusEffect(page: Page, actorId: string, effectId: string): Promise<ConditionProbe> {
    const errors: string[] = [];
    const listener = (err: Error): void => {
        errors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ actorId: probeActorId, effectId: probeEffectId }) => {
                const { game: gameGlobal } = globalThis as unknown as {
                    game?: {
                        actors?: {
                            get?: (id: string) =>
                                | {
                                      toggleStatusEffect?: (id: string, opts?: { active?: boolean }) => Promise<unknown>;
                                      statuses?: Set<string>;
                                      effects?: { find: (cb: (e: { statuses?: Set<string>; name?: string }) => boolean) => unknown };
                                  }
                                | undefined;
                        };
                    };
                };
                const actor = gameGlobal?.actors?.get?.(probeActorId);
                if (!actor) return { appliedOk: false, removedOk: false, error: 'actor lookup failed' };
                if (typeof actor.toggleStatusEffect !== 'function') {
                    return { appliedOk: false, removedOk: false, error: 'actor.toggleStatusEffect unavailable' };
                }
                try {
                    await actor.toggleStatusEffect(probeEffectId, { active: true });
                } catch (err) {
                    return { appliedOk: false, removedOk: false, error: `toggle-on threw: ${String((err as Error)?.message ?? err)}` };
                }
                const hasAfterOn = Boolean(actor.statuses?.has(probeEffectId)) || Boolean(actor.effects?.find((e) => e.statuses?.has(probeEffectId) ?? false));
                if (!hasAfterOn) {
                    return { appliedOk: false, removedOk: false, error: 'effect not present after toggle-on' };
                }
                try {
                    await actor.toggleStatusEffect(probeEffectId, { active: false });
                } catch (err) {
                    return { appliedOk: true, removedOk: false, error: `toggle-off threw: ${String((err as Error)?.message ?? err)}` };
                }
                const hasAfterOff = Boolean(actor.statuses?.has(probeEffectId)) || Boolean(actor.effects?.find((e) => e.statuses?.has(probeEffectId) ?? false));
                if (hasAfterOff) {
                    return { appliedOk: true, removedOk: false, error: 'effect still present after toggle-off' };
                }
                return { appliedOk: true, removedOk: true, error: null };
            },
            { actorId, effectId },
        );
        return {
            id: effectId,
            appliedOk: result.appliedOk,
            removedOk: result.removedOk,
            error: result.error,
            pageErrors: errors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('conditions / status effects (Tier B)', () => {
    test('every CONFIG.statusEffects entry applies + removes on an actor', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const effectIds = await listStatusEffectIds(page);
        test.skip(effectIds.length === 0, 'no CONFIG.statusEffects discovered');

        const parent = await createParentActor(page);
        expect('id' in parent, `parent actor create failed: ${'error' in parent ? parent.error : 'unknown'}`).toBe(true);
        const actorId = (parent as ActorRef).id;

        const failures: string[] = [];
        try {
            for (const effectId of effectIds) {
                const probe = await probeStatusEffect(page, actorId, effectId).catch((err) => ({
                    id: effectId,
                    appliedOk: false,
                    removedOk: false,
                    error: String((err as Error)?.message ?? err),
                    pageErrors: [] as string[],
                }));
                if (probe.appliedOk) {
                    recordCoverage('condition.toggle', probe.id);
                }
                if (probe.error) {
                    failures.push(`${probe.id}: ${probe.error}`);
                    continue;
                }
                if (probe.pageErrors.length > 0) {
                    failures.push(`${probe.id}: pageerror: ${probe.pageErrors[0]}`);
                }
            }
        } finally {
            await deleteActor(page, actorId).catch(() => undefined);
        }

        expect(failures, `${failures.length}/${effectIds.length} status effects failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
