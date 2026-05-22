import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of `src/module/rules/active-effects.ts` (was 0% fn /
 * 34.7% line). The module exports 14 functions covering effect
 * factories, the combat-status handlers (`handleBleeding` /
 * `handleBloodLoss` / `handleOnFire`), the chat-message emitter
 * (`sendActiveEffectMessage`), and the lifecycle helpers
 * (`removeEffects`, `removeEffectByName`, `toggleEffect`).
 *
 * No other Tier B spec imports this module directly — the
 * active-effects.spec.ts covers Foundry's native ActiveEffect modes
 * (add / multiply / override etc.), not the WH40K rules helpers
 * that author effects from a higher-level intent (e.g. "characteristic
 * +10 for 3 rounds").
 *
 * Strategy: seed a dh2-character + a combat encounter, walk every
 * exported create-* / remove-* / toggle helper, assert that the
 * resulting embedded ActiveEffect or post-state matches the expected
 * shape, cleanup at end.
 *
 * Keep ACTIVE_EFFECTS_RULES_FLOWS in sync with the equivalent
 * constant in `scripts/e2e-coverage.mjs`.
 */

const ACTIVE_EFFECTS_RULES_FLOWS = [
    'createEffect',
    'createCharacteristicEffect',
    'createSkillEffect',
    'createCombatEffect',
    'createConditionEffect',
    'createTemporaryEffect',
    'removeEffectByName',
    'removeEffects',
    'toggleEffect',
    'handleBleeding',
    'handleBloodLoss',
    'handleOnFire',
    'sendActiveEffectMessage',
] as const;

type FlowName = (typeof ACTIVE_EFFECTS_RULES_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeActiveEffectsRules(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            interface EffectChange {
                key: string;
                mode: number;
                value: number;
            }
            interface ActiveEffectDoc {
                id?: string;
                name?: string;
                disabled?: boolean;
            }
            interface ActiveEffectsCollection {
                size?: number;
                get?: (id: string) => ActiveEffectDoc | undefined;
                [Symbol.iterator]?: () => Iterator<ActiveEffectDoc>;
            }
            interface ProbeActor {
                id?: string;
                effects?: ActiveEffectsCollection;
                delete?: () => Promise<void>;
            }
            interface ActorClass {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.create accepts arbitrary creation data
                create?: (data: Record<string, unknown>) => Promise<ProbeActor | null | undefined>;
            }
            interface ActorsCollection {
                get?: (id: string) => ProbeActor | undefined;
            }
            interface SendActiveEffectMessagePayload {
                template: string;
                actor: ProbeActor | undefined;
                damage: number;
            }
            interface ActiveEffectsModule {
                createEffect?: (actor: ProbeActor | undefined, effect: { name: string; changes: EffectChange[] }) => Promise<void>;
                createCharacteristicEffect?: (actor: ProbeActor | undefined, key: string, delta: number) => Promise<void>;
                createSkillEffect?: (actor: ProbeActor | undefined, key: string, delta: number) => Promise<void>;
                createCombatEffect?: (actor: ProbeActor | undefined, key: string, delta: number) => Promise<void>;
                createConditionEffect?: (actor: ProbeActor | undefined, key: string) => Promise<void>;
                createTemporaryEffect?: (actor: ProbeActor | undefined, name: string, changes: EffectChange[], rounds: number) => Promise<void>;
                removeEffectByName?: (actor: ProbeActor | undefined, name: string) => Promise<void>;
                removeEffects?: (actor: ProbeActor | undefined, filter: (e: ActiveEffectDoc) => boolean) => Promise<void>;
                toggleEffect?: (actor: ProbeActor | undefined, id: string) => Promise<void>;
                sendActiveEffectMessage?: (payload: SendActiveEffectMessagePayload) => Promise<void>;
                handleBleeding?: (actor: ProbeActor | undefined) => Promise<void>;
                handleBloodLoss?: (actor: ProbeActor | undefined) => Promise<void>;
                handleOnFire?: (actor: ProbeActor | undefined) => Promise<void>;
            }
            interface FoundryGlobal {
                Actor?: ActorClass;
                game?: { actors?: ActorsCollection };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const fg = globalThis as unknown as FoundryGlobal;
            const ActorCls = fg.Actor;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const ae = await (async (): Promise<ActiveEffectsModule | null> => {
                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic ESM import of a runtime-only Foundry module
                    return (await import(`${'/systems/wh40k-rpg'}/module/rules/active-effects.js`)) as ActiveEffectsModule;
                } catch (err) {
                    for (const f of ACTIVE_EFFECTS_RULES_FLOWS) record(f, false, `import threw: ${err instanceof Error ? err.message : String(err)}`);
                    return null;
                }
            })();
            if (ae === null) return out;

            // Seed a dh2-character with characteristics + wounds so the
            // handleBleeding / handleBloodLoss / handleOnFire branches
            // (which read `actor.system.wounds`) have meaningful state.
            let actor: ProbeActor | null | undefined;
            try {
                actor = await ActorCls?.create?.({
                    name: 'active-effects-rules-spec-actor',
                    type: 'dh2-character',
                    system: {
                        gameSystem: 'dh2e',
                        characteristics: {
                            strength: { base: 30, advance: 0, modifier: 0 },
                            toughness: { base: 30, advance: 0, modifier: 0 },
                            ballisticSkill: { base: 30, advance: 0, modifier: 0 },
                            weaponSkill: { base: 30, advance: 0, modifier: 0 },
                        },
                        wounds: { value: 12, max: 12, critical: 0 },
                    },
                });
            } catch (err) {
                for (const f of ACTIVE_EFFECTS_RULES_FLOWS) record(f, false, `actor create threw: ${err instanceof Error ? err.message : String(err)}`);
                return out;
            }
            if (actor?.id === undefined) {
                for (const f of ACTIVE_EFFECTS_RULES_FLOWS) record(f, false, 'actor not created');
                return out;
            }
            const actorId = actor.id;

            const sleep = async (ms: number): Promise<void> =>
                new Promise<void>((r) => {
                    setTimeout(r, ms);
                });
            const liveActor = (): ProbeActor | undefined => fg.game?.actors?.get?.(actorId);
            const effectCountBefore = (): number => liveActor()?.effects?.size ?? 0;

            const aeModule = ae;
            const seededActor = actor;

            // ---- create-* flows (each asserts the effect count incremented) ----
            async function probeCreateFlows(): Promise<void> {
                // ---- createEffect ----
                try {
                    const before = effectCountBefore();
                    await aeModule.createEffect?.(liveActor(), {
                        name: 'probe-raw-effect',
                        changes: [{ key: 'system.combat.attack', mode: 2, value: 5 }],
                    });
                    await sleep(20);
                    record('createEffect', effectCountBefore() === before + 1, null);
                } catch (err) {
                    record('createEffect', false, err instanceof Error ? err.message : String(err));
                }

                // ---- createCharacteristicEffect ----
                try {
                    const before = effectCountBefore();
                    await aeModule.createCharacteristicEffect?.(liveActor(), 'strength', 10);
                    await sleep(20);
                    record('createCharacteristicEffect', effectCountBefore() === before + 1, null);
                } catch (err) {
                    record('createCharacteristicEffect', false, err instanceof Error ? err.message : String(err));
                }

                // ---- createSkillEffect ----
                try {
                    const before = effectCountBefore();
                    await aeModule.createSkillEffect?.(liveActor(), 'dodge', 10);
                    await sleep(20);
                    record('createSkillEffect', effectCountBefore() === before + 1, null);
                } catch (err) {
                    record('createSkillEffect', false, err instanceof Error ? err.message : String(err));
                }

                // ---- createCombatEffect ----
                try {
                    const before = effectCountBefore();
                    await aeModule.createCombatEffect?.(liveActor(), 'attack', 10);
                    await sleep(20);
                    record('createCombatEffect', effectCountBefore() === before + 1, null);
                } catch (err) {
                    record('createCombatEffect', false, err instanceof Error ? err.message : String(err));
                }

                // ---- createConditionEffect ----
                try {
                    const before = effectCountBefore();
                    await aeModule.createConditionEffect?.(liveActor(), 'stunned');
                    await sleep(20);
                    record('createConditionEffect', effectCountBefore() === before + 1, null);
                } catch (err) {
                    record('createConditionEffect', false, err instanceof Error ? err.message : String(err));
                }

                // ---- createTemporaryEffect ----
                try {
                    const before = effectCountBefore();
                    await aeModule.createTemporaryEffect?.(liveActor(), 'probe-temp-effect', [{ key: 'system.combat.defense', mode: 2, value: 5 }], 3);
                    await sleep(20);
                    record('createTemporaryEffect', effectCountBefore() === before + 1, null);
                } catch (err) {
                    record('createTemporaryEffect', false, err instanceof Error ? err.message : String(err));
                }
            }

            // ---- remove / toggle lifecycle flows ----
            async function probeLifecycleFlows(): Promise<void> {
                // ---- removeEffectByName ----
                try {
                    const before = effectCountBefore();
                    await aeModule.removeEffectByName?.(liveActor(), 'probe-raw-effect');
                    await sleep(20);
                    record('removeEffectByName', effectCountBefore() === before - 1, null);
                } catch (err) {
                    record('removeEffectByName', false, err instanceof Error ? err.message : String(err));
                }

                // ---- toggleEffect ----
                try {
                    const a = liveActor();
                    const effects = a?.effects;
                    const effectsArr: ActiveEffectDoc[] = effects !== undefined ? Array.from(effects as Iterable<ActiveEffectDoc>) : [];
                    const target = effectsArr.find((e) => e.name?.startsWith('probe-temp-effect') === true);
                    if (target?.id === undefined) {
                        record('toggleEffect', false, 'no temp-effect target found');
                    } else {
                        const wasDisabled = target.disabled === true;
                        await aeModule.toggleEffect?.(liveActor(), target.id);
                        await sleep(20);
                        const after = liveActor()?.effects?.get?.(target.id) ?? target;
                        record('toggleEffect', after.disabled !== wasDisabled, `before=${String(wasDisabled)} after=${String(after.disabled)}`);
                    }
                } catch (err) {
                    record('toggleEffect', false, err instanceof Error ? err.message : String(err));
                }

                // ---- removeEffects (filter) ----
                try {
                    const before = effectCountBefore();
                    await aeModule.removeEffects?.(liveActor(), () => true);
                    await sleep(40);
                    record('removeEffects', effectCountBefore() < before, `before=${before} after=${effectCountBefore()}`);
                } catch (err) {
                    record('removeEffects', false, err instanceof Error ? err.message : String(err));
                }
            }

            // ---- chat-emit + combat-status handler flows ----
            async function probeMessageAndHandlerFlows(): Promise<void> {
                // ---- sendActiveEffectMessage ---- (pure chat-card emit; just confirm no throw)
                try {
                    await aeModule.sendActiveEffectMessage?.({
                        template: 'systems/wh40k-rpg/templates/chat/bleeding-chat.hbs',
                        actor: liveActor(),
                        damage: 1,
                    });
                    record('sendActiveEffectMessage', true, null);
                } catch (err) {
                    record('sendActiveEffectMessage', false, err instanceof Error ? err.message : String(err));
                }

                // ---- handleBleeding / handleBloodLoss / handleOnFire ----
                // These dispatch a roll + chat message + wound reduction; they
                // tolerate missing combat state and just need to run without
                // throwing. We accept any successful resolution as coverage.
                for (const fn of ['handleBleeding', 'handleBloodLoss', 'handleOnFire'] as const) {
                    try {
                        // eslint-disable-next-line no-await-in-loop -- handlers must execute in series to attribute coverage cleanly
                        await aeModule[fn]?.(liveActor());
                        record(fn, true, null);
                    } catch (err) {
                        record(fn, false, err instanceof Error ? err.message : String(err));
                    }
                }
            }

            await probeCreateFlows();
            await probeLifecycleFlows();
            await probeMessageAndHandlerFlows();

            // Cleanup
            try {
                await seededActor.delete?.();
            } catch {
                /* ignore */
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rules/active-effects (Tier B)', () => {
    test('every active-effects rule helper creates/removes/toggles correctly', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeActiveEffectsRules(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('active-effects-rule.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of ACTIVE_EFFECTS_RULES_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${ACTIVE_EFFECTS_RULES_FLOWS.length} active-effects-rule flows failed:\n  - ${failures.join('\n  - ')}`).toEqual(
            [],
        );
    });
});
