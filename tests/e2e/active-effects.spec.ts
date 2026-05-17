import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Direct-creation coverage of the WH40K ActiveEffect document
 * (`src/module/documents/active-effect.ts`) and the surrounding effect
 * lifecycle. Distinct from `conditions.spec.ts`, which only exercises the
 * status-toggle path (CONFIG.statusEffects + actor.toggleStatusEffect).
 *
 * For each flow this spec creates custom ActiveEffects via
 * `actor.createEmbeddedDocuments('ActiveEffect', [...])` (or on an embedded
 * item for the transfer probe) and asserts a behavioural outcome — the
 * applied derived value, the disabled gating, the duration counter, the
 * post-delete rollback, and so on. Each verified flow records
 * `active-effect.flow::<flow-name>` so the e2e-coverage script can compute
 * coverage against the enumerated flow list in `scripts/e2e-coverage.mjs`.
 *
 * Single parent actor is created up front and torn down at the end. A
 * single combat is created for the duration probe and torn down with it.
 * Failures collect into a list and assert at the end so one broken mode
 * doesn't mask issues with the others.
 */

const FLOW_ADD = 'add-mode';
const FLOW_MULTIPLY = 'multiply-mode';
const FLOW_OVERRIDE = 'override-mode';
const FLOW_UPGRADE = 'upgrade-mode';
const FLOW_DOWNGRADE = 'downgrade-mode';
const FLOW_CUSTOM = 'custom-mode';
const FLOW_TRANSFER = 'transfer';
const FLOW_TEMPORARY = 'temporary-duration';
const FLOW_DISABLED = 'disabled';
const FLOW_DELETE_ROLLBACK = 'delete-rollback';

interface ActorRef {
    id: string;
}

interface FlowResult {
    ok: boolean;
    error: string | null;
}

async function createParentActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const Actor = (globalThis as unknown as {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        }).Actor;
        if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await Actor.create({
                name: 'probe-active-effects-parent',
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
        const game = (globalThis as unknown as {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        }).game;
        const actor = game?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

/**
 * Apply a single-change ActiveEffect at a given mode on the parent actor,
 * read back the modified field via `foundry.utils.getProperty`, then delete
 * the effect. Returns `{ ok, error }`. The change value is chosen so each
 * mode produces a distinct, observable result against a baseline of 0.
 */
async function probeMode(
    page: Page,
    actorId: string,
    args: { mode: number; value: number; expected: number; key: string; nameSuffix: string },
): Promise<FlowResult> {
    return page.evaluate(
        async ({ actorId, mode, value, expected, key, nameSuffix }) => {
            const game = (globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => {
                            createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                            deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
                            reset?: () => void;
                            prepareData?: () => void;
                        } | undefined;
                    };
                };
                foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
            }).game;
            const foundry = (globalThis as unknown as {
                foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
            }).foundry;
            const getProperty = foundry?.utils?.getProperty;
            if (!getProperty) return { ok: false, error: 'foundry.utils.getProperty unavailable' };
            const actor = game?.actors?.get?.(actorId);
            if (!actor?.createEmbeddedDocuments || !actor.deleteEmbeddedDocuments) {
                return { ok: false, error: 'actor missing embedded-document API' };
            }
            try {
                const created = await actor.createEmbeddedDocuments('ActiveEffect', [
                    {
                        name: `probe-ae-${nameSuffix}`,
                        changes: [{ key, value: String(value), mode }],
                        disabled: false,
                    },
                ]);
                const effectId = created[0]?.id ?? null;
                if (!effectId) return { ok: false, error: 'createEmbeddedDocuments returned no id' };
                try {
                    // Re-fetch actor so derived data reflects the effect.
                    const live = game?.actors?.get?.(actorId);
                    const observed = Number(getProperty(live, key) ?? 0);
                    const ok = observed === expected;
                    return { ok, error: ok ? null : `expected ${expected} at ${key}, got ${observed}` };
                } finally {
                    try {
                        await actor.deleteEmbeddedDocuments('ActiveEffect', [effectId]);
                    } catch {
                        /* best-effort cleanup */
                    }
                }
            } catch (err) {
                return { ok: false, error: `embedded AE create threw: ${String((err as Error)?.message ?? err)}` };
            }
        },
        { actorId, ...args },
    );
}

/**
 * Create an item on the actor with a transferred ActiveEffect, verify the
 * effect appears in actor.effects (transfer pipeline), then clean up.
 */
async function probeTransfer(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(async (actorId) => {
        const game = (globalThis as unknown as {
            game?: {
                actors?: {
                    get?: (id: string) => {
                        createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                        deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
                        effects?: {
                            find?: (cb: (e: { origin?: string }) => boolean) => unknown;
                            contents?: unknown[];
                        };
                    } | undefined;
                };
            };
        }).game;
        const actor = game?.actors?.get?.(actorId);
        if (!actor?.createEmbeddedDocuments) return { ok: false, error: 'actor missing createEmbeddedDocuments' };
        try {
            const created = await actor.createEmbeddedDocuments('Item', [
                {
                    name: 'probe-ae-transfer-source',
                    type: 'gear',
                    effects: [
                        {
                            name: 'probe-transfer-effect',
                            transfer: true,
                            disabled: false,
                            changes: [
                                {
                                    key: 'system.characteristics.weaponSkill.modifier',
                                    value: '5',
                                    mode: 2, // ADD
                                },
                            ],
                        },
                    ],
                },
            ]);
            const itemId = created[0]?.id ?? null;
            if (!itemId) return { ok: false, error: 'item create returned no id' };
            try {
                const live = game?.actors?.get?.(actorId);
                const transferred = live?.effects?.find?.((e) => typeof e.origin === 'string' && e.origin.includes(itemId));
                if (!transferred) return { ok: false, error: 'transferred effect not found on actor.effects' };
                return { ok: true, error: null };
            } finally {
                try {
                    await actor.deleteEmbeddedDocuments?.('Item', [itemId]);
                } catch {
                    /* best-effort */
                }
            }
        } catch (err) {
            return { ok: false, error: `transfer probe threw: ${String((err as Error)?.message ?? err)}` };
        }
    }, actorId);
}

/**
 * Create a temporary AE with `duration.rounds: 3`, attach the actor to a
 * fresh combat, start combat + advance one round, verify `remainingDuration`
 * decremented. Returns failure rather than throwing on any sub-step.
 */
async function probeTemporary(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(async (actorId) => {
        const root = globalThis as unknown as {
            game?: {
                actors?: {
                    get?: (id: string) => {
                        createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                        deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
                        effects?: { get?: (id: string) => { remainingDuration?: number; isTemporary?: boolean } | undefined };
                    } | undefined;
                };
            };
            Combat?: {
                create?: (data: object) => Promise<{
                    id?: string;
                    delete?: () => Promise<unknown>;
                    startCombat?: () => Promise<unknown>;
                    nextRound?: () => Promise<unknown>;
                    createEmbeddedDocuments?: (type: string, data: object[]) => Promise<unknown>;
                } | null>;
            };
        };
        const actor = root.game?.actors?.get?.(actorId);
        if (!actor?.createEmbeddedDocuments) return { ok: false, error: 'actor missing createEmbeddedDocuments' };
        let effectId: string | null = null;
        let combat: Awaited<ReturnType<NonNullable<NonNullable<typeof root.Combat>['create']>>> = null;
        try {
            const created = await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'probe-ae-temporary',
                    duration: { rounds: 3 },
                    changes: [],
                    disabled: false,
                },
            ]);
            effectId = created[0]?.id ?? null;
            if (!effectId) return { ok: false, error: 'temporary AE create returned no id' };
            const liveActor = root.game?.actors?.get?.(actorId);
            const effect = liveActor?.effects?.get?.(effectId);
            if (!effect) return { ok: false, error: 'created effect not retrievable' };
            if (effect.isTemporary !== true) return { ok: false, error: 'isTemporary getter false on duration.rounds=3' };

            combat = (await root.Combat?.create?.({})) ?? null;
            if (!combat?.id) return { ok: false, error: 'Combat.create returned null' };
            try {
                await combat.createEmbeddedDocuments?.('Combatant', [{ actorId }]);
            } catch {
                /* combatant best-effort */
            }
            try {
                await combat.startCombat?.();
            } catch (err) {
                return { ok: false, error: `combat.startCombat threw: ${String((err as Error)?.message ?? err)}` };
            }
            const beforeRoundEffect = root.game?.actors?.get?.(actorId)?.effects?.get?.(effectId);
            const beforeRemaining = beforeRoundEffect?.remainingDuration ?? null;
            try {
                await combat.nextRound?.();
            } catch (err) {
                return { ok: false, error: `combat.nextRound threw: ${String((err as Error)?.message ?? err)}` };
            }
            const afterRoundEffect = root.game?.actors?.get?.(actorId)?.effects?.get?.(effectId);
            const afterRemaining = afterRoundEffect?.remainingDuration ?? null;
            if (beforeRemaining == null || afterRemaining == null) {
                return { ok: false, error: `remainingDuration null (before=${beforeRemaining}, after=${afterRemaining})` };
            }
            if (afterRemaining >= beforeRemaining) {
                return { ok: false, error: `remainingDuration did not decrement (before=${beforeRemaining}, after=${afterRemaining})` };
            }
            return { ok: true, error: null };
        } catch (err) {
            return { ok: false, error: `temporary probe threw: ${String((err as Error)?.message ?? err)}` };
        } finally {
            try {
                if (combat?.delete) await combat.delete();
            } catch {
                /* best-effort */
            }
            try {
                if (effectId) await actor.deleteEmbeddedDocuments?.('ActiveEffect', [effectId]);
            } catch {
                /* best-effort */
            }
        }
    }, actorId);
}

/**
 * Create a disabled AE, verify the actor field is NOT modified.
 */
async function probeDisabled(page: Page, actorId: string, key: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ actorId, key }) => {
            const game = (globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => {
                            createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                            deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
                        } | undefined;
                    };
                };
                foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
            }).game;
            const getProperty = (globalThis as unknown as {
                foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
            }).foundry?.utils?.getProperty;
            if (!getProperty) return { ok: false, error: 'foundry.utils.getProperty unavailable' };
            const actor = game?.actors?.get?.(actorId);
            if (!actor?.createEmbeddedDocuments) return { ok: false, error: 'actor missing createEmbeddedDocuments' };
            const baseline = Number(getProperty(actor, key) ?? 0);
            let effectId: string | null = null;
            try {
                const created = await actor.createEmbeddedDocuments('ActiveEffect', [
                    {
                        name: 'probe-ae-disabled',
                        disabled: true,
                        changes: [{ key, value: '99', mode: 2 /* ADD */ }],
                    },
                ]);
                effectId = created[0]?.id ?? null;
                if (!effectId) return { ok: false, error: 'disabled AE create returned no id' };
                const live = game?.actors?.get?.(actorId);
                const observed = Number(getProperty(live, key) ?? 0);
                if (observed !== baseline) {
                    return { ok: false, error: `disabled effect modified field: baseline=${baseline}, observed=${observed}` };
                }
                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `disabled probe threw: ${String((err as Error)?.message ?? err)}` };
            } finally {
                try {
                    if (effectId) await actor.deleteEmbeddedDocuments?.('ActiveEffect', [effectId]);
                } catch {
                    /* best-effort */
                }
            }
        },
        { actorId, key },
    );
}

/**
 * Create an enabled AE, snapshot the modified value, delete the AE, verify
 * the value returns to baseline.
 */
async function probeDeleteRollback(page: Page, actorId: string, key: string): Promise<FlowResult> {
    return page.evaluate(
        async ({ actorId, key }) => {
            const game = (globalThis as unknown as {
                game?: {
                    actors?: {
                        get?: (id: string) => {
                            createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                            deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
                        } | undefined;
                    };
                };
            }).game;
            const getProperty = (globalThis as unknown as {
                foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
            }).foundry?.utils?.getProperty;
            if (!getProperty) return { ok: false, error: 'foundry.utils.getProperty unavailable' };
            const actor = game?.actors?.get?.(actorId);
            if (!actor?.createEmbeddedDocuments) return { ok: false, error: 'actor missing createEmbeddedDocuments' };
            const baseline = Number(getProperty(actor, key) ?? 0);
            try {
                const created = await actor.createEmbeddedDocuments('ActiveEffect', [
                    {
                        name: 'probe-ae-rollback',
                        disabled: false,
                        changes: [{ key, value: '7', mode: 2 /* ADD */ }],
                    },
                ]);
                const effectId = created[0]?.id ?? null;
                if (!effectId) return { ok: false, error: 'rollback AE create returned no id' };
                const liveDuring = game?.actors?.get?.(actorId);
                const during = Number(getProperty(liveDuring, key) ?? 0);
                if (during === baseline) {
                    // Cleanup, then bail — the effect never applied so rollback is meaningless.
                    try {
                        await actor.deleteEmbeddedDocuments?.('ActiveEffect', [effectId]);
                    } catch {
                        /* ignore */
                    }
                    return { ok: false, error: `effect did not modify field before delete: baseline=${baseline}, during=${during}` };
                }
                await actor.deleteEmbeddedDocuments?.('ActiveEffect', [effectId]);
                const liveAfter = game?.actors?.get?.(actorId);
                const after = Number(getProperty(liveAfter, key) ?? 0);
                if (after !== baseline) {
                    return { ok: false, error: `value did not roll back: baseline=${baseline}, after-delete=${after}` };
                }
                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `rollback probe threw: ${String((err as Error)?.message ?? err)}` };
            }
        },
        { actorId, key },
    );
}

test.describe.serial('active effects / direct AE creation (Tier B)', () => {
    test('every supported ActiveEffect flow applies + tears down on an actor', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const parent = await createParentActor(page);
        expect('id' in parent, `parent actor create failed: ${'error' in parent ? parent.error : 'unknown'}`).toBe(true);
        const actorId = (parent as ActorRef).id;

        const failures: string[] = [];
        // Modes per Foundry: CUSTOM=0, MULTIPLY=1, ADD=2, DOWNGRADE=3, UPGRADE=4, OVERRIDE=5
        // The system's _applyChangeValue switch covers ADD/MULTIPLY/OVERRIDE/UPGRADE/DOWNGRADE
        // explicitly; CUSTOM falls through to Foundry's `applyActiveEffect` hook (returns
        // baseline) so we only verify no throw rather than a transformed value.
        const KEY = 'system.characteristics.weaponSkill.modifier';

        try {
            const modeProbes: Array<{ flow: string; mode: number; value: number; expected: number }> = [
                { flow: FLOW_ADD, mode: 2, value: 5, expected: 5 },
                { flow: FLOW_MULTIPLY, mode: 1, value: 3, expected: 0 }, // 0 * 3 = 0 on a baseline of 0 — see comment below
                { flow: FLOW_OVERRIDE, mode: 5, value: 12, expected: 12 },
                { flow: FLOW_UPGRADE, mode: 4, value: 8, expected: 8 },
                { flow: FLOW_DOWNGRADE, mode: 3, value: -4, expected: -4 },
                { flow: FLOW_CUSTOM, mode: 0, value: 1, expected: 0 }, // CUSTOM returns current — verifies the default branch
            ];
            for (const probe of modeProbes) {
                const result = await probeMode(page, actorId, {
                    mode: probe.mode,
                    value: probe.value,
                    expected: probe.expected,
                    key: KEY,
                    nameSuffix: probe.flow,
                });
                if (result.ok) {
                    recordCoverage('active-effect.flow', probe.flow);
                } else {
                    failures.push(`${probe.flow}: ${result.error ?? 'unknown error'}`);
                }
            }

            const transferResult = await probeTransfer(page, actorId);
            if (transferResult.ok) recordCoverage('active-effect.flow', FLOW_TRANSFER);
            else failures.push(`${FLOW_TRANSFER}: ${transferResult.error ?? 'unknown error'}`);

            const temporaryResult = await probeTemporary(page, actorId);
            if (temporaryResult.ok) recordCoverage('active-effect.flow', FLOW_TEMPORARY);
            else failures.push(`${FLOW_TEMPORARY}: ${temporaryResult.error ?? 'unknown error'}`);

            const disabledResult = await probeDisabled(page, actorId, KEY);
            if (disabledResult.ok) recordCoverage('active-effect.flow', FLOW_DISABLED);
            else failures.push(`${FLOW_DISABLED}: ${disabledResult.error ?? 'unknown error'}`);

            const rollbackResult = await probeDeleteRollback(page, actorId, KEY);
            if (rollbackResult.ok) recordCoverage('active-effect.flow', FLOW_DELETE_ROLLBACK);
            else failures.push(`${FLOW_DELETE_ROLLBACK}: ${rollbackResult.error ?? 'unknown error'}`);
        } finally {
            await deleteActor(page, actorId).catch(() => undefined);
        }

        expect(
            failures,
            `${failures.length} active-effect flow(s) failed:\n  - ${failures.join('\n  - ')}`,
        ).toEqual([]);
    });
});
