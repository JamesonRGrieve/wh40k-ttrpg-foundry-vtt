import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { test } from './lib/test';

/**
 * Tier B coverage of `src/module/rules/active-effects.ts`. The module
 * exports the effect factories, the data-driven condition tick processor
 * (`processConditionTicks`), and the lifecycle helpers (`removeEffects`,
 * `removeEffectByName`, `toggleEffect`).
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
    'processConditionTicks',
] as const;

type FlowName = (typeof ACTIVE_EFFECTS_RULES_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeActiveEffectsRules(page: Page): Promise<{ results: FlowResult[] }> {
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
            processConditionTicks?: (actor: ProbeActor | undefined) => Promise<void>;
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
        // condition tick processor (which rolls tests against the bearer's
        // characteristics) has meaningful state.
        let actor: ProbeActor | null | undefined;
        try {
            actor = await ActorCls?.create?.({
                name: 'active-effects-rules-spec-actor',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2',
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

        const { pollUntil } = globalThis.wh40kE2E;
        const liveActor = (): ProbeActor | undefined => fg.game?.actors?.get?.(actorId);
        const effectCountBefore = (): number => liveActor()?.effects?.size ?? 0;
        /** Wait for the effect count to reach `expected` (each record below reports a miss). */
        const awaitEffectCount = async (expected: number): Promise<void> => {
            await pollUntil(() => effectCountBefore() === expected);
        };

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
                await awaitEffectCount(before + 1);
                record('createEffect', effectCountBefore() === before + 1, null);
            } catch (err) {
                record('createEffect', false, err instanceof Error ? err.message : String(err));
            }

            // ---- createCharacteristicEffect ----
            try {
                const before = effectCountBefore();
                await aeModule.createCharacteristicEffect?.(liveActor(), 'strength', 10);
                await awaitEffectCount(before + 1);
                record('createCharacteristicEffect', effectCountBefore() === before + 1, null);
            } catch (err) {
                record('createCharacteristicEffect', false, err instanceof Error ? err.message : String(err));
            }

            // ---- createSkillEffect ----
            try {
                const before = effectCountBefore();
                await aeModule.createSkillEffect?.(liveActor(), 'dodge', 10);
                await awaitEffectCount(before + 1);
                record('createSkillEffect', effectCountBefore() === before + 1, null);
            } catch (err) {
                record('createSkillEffect', false, err instanceof Error ? err.message : String(err));
            }

            // ---- createCombatEffect ----
            try {
                const before = effectCountBefore();
                await aeModule.createCombatEffect?.(liveActor(), 'attack', 10);
                await awaitEffectCount(before + 1);
                record('createCombatEffect', effectCountBefore() === before + 1, null);
            } catch (err) {
                record('createCombatEffect', false, err instanceof Error ? err.message : String(err));
            }

            // ---- createConditionEffect ----
            try {
                const before = effectCountBefore();
                await aeModule.createConditionEffect?.(liveActor(), 'stunned');
                await awaitEffectCount(before + 1);
                record('createConditionEffect', effectCountBefore() === before + 1, null);
            } catch (err) {
                record('createConditionEffect', false, err instanceof Error ? err.message : String(err));
            }

            // ---- createTemporaryEffect ----
            try {
                const before = effectCountBefore();
                await aeModule.createTemporaryEffect?.(liveActor(), 'probe-temp-effect', [{ key: 'system.combat.defense', mode: 2, value: 5 }], 3);
                await awaitEffectCount(before + 1);
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
                await awaitEffectCount(before - 1);
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
                    const targetId = target.id;
                    const readToggled = (): ActiveEffectDoc => liveActor()?.effects?.get?.(targetId) ?? target;
                    await pollUntil(() => readToggled().disabled !== wasDisabled);
                    const after = readToggled();
                    record('toggleEffect', after.disabled !== wasDisabled, `before=${String(wasDisabled)} after=${String(after.disabled)}`);
                }
            } catch (err) {
                record('toggleEffect', false, err instanceof Error ? err.message : String(err));
            }

            // ---- removeEffects (filter) ----
            try {
                const before = effectCountBefore();
                await aeModule.removeEffects?.(liveActor(), () => true);
                await pollUntil(() => effectCountBefore() < before);
                record('removeEffects', effectCountBefore() < before, `before=${before} after=${effectCountBefore()}`);
            } catch (err) {
                record('removeEffects', false, err instanceof Error ? err.message : String(err));
            }
        }

        // ---- condition tick processor ----
        // Rolls each ticking condition's damage / test and posts its card; it
        // tolerates an actor with no ticking condition and just needs to run
        // without throwing. Runs while the stunned condition is still applied.
        async function probeTickFlow(): Promise<void> {
            try {
                await aeModule.processConditionTicks?.(liveActor());
                record('processConditionTicks', true, null);
            } catch (err) {
                record('processConditionTicks', false, err instanceof Error ? err.message : String(err));
            }
        }

        await probeCreateFlows();
        await probeTickFlow();
        await probeLifecycleFlows();

        // Cleanup
        try {
            await seededActor.delete?.();
        } catch {
            /* ignore */
        }

        return out;
    });
    return { results };
}

test.describe.serial('rules/active-effects (Tier B)', () => {
    test('every active-effects rule helper creates/removes/toggles correctly', async ({ page }) => {
        await joinOrSkip(page);

        const probe = await probeActiveEffectsRules(page);
        assertFlowResults(probe, ACTIVE_EFFECTS_RULES_FLOWS, { dimension: 'active-effects-rule.flow', label: 'active-effects-rule' });
    });
});
