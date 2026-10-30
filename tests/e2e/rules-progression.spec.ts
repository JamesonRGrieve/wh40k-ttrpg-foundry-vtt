import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { test } from './lib/test';

/**
 * Tier B coverage of the remaining pure-logic / progression surface in
 * `src/module/rules/*` that no other Tier B spec imports directly.
 * `rules-engine.spec.ts` already covers the damage / jam / quality /
 * critical / config / ammo cluster; `active-effects-rules.spec.ts`,
 * `subtlety.spec.ts`, and the per-supplement specs cover the rest of
 * the inventory. This spec dynamic-imports the still-uncovered modules
 * and drives their canonical entry points against synthetic inputs so
 * the v8 coverage capture lights up every export.
 *
 * Modules exercised (all were at 0% function coverage from Tier B
 * before this spec because the system code reaches them only via
 * Actor / Item roll methods, which take other paths in headless mode):
 *   - `xenos-features.ts` — role / talent / homeworld constant table.
 *   - `weapon-training.ts` — `checkWeaponTraining`,
 *     `getWeaponTrainingModifier`, `getWeaponTrainingDescription`
 *     (no-training / untrained branches against a synthetic actor).
 *   - `weapon-modifiers.ts` — `updateWeaponModifiers`,
 *     `calculateWeaponModifiersAttackBonuses`,
 *     `calculateWeaponModifiersAttackSpecials` driven with a minimal
 *     rollData whose actionItem has an empty item collection (the
 *     loop-skip / early-return paths — the mutators complete without
 *     throwing, which is the covered outcome).
 *   - `range.ts` — `calculateWeaponRange` for the melee branch and the
 *     no-weapon guard branch (both side-effect-only on the rollData).
 *
 * Each flow records `rule-progression.flow::<name>`. Keys MUST match
 * the RULE_PROGRESSION_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator).
 */

const RULE_PROGRESSION_FLOWS = [
    'xenos-features-constants',
    'weapon-training-check-noTraining',
    'weapon-training-check-untrained',
    'weapon-training-modifier',
    'weapon-training-description',
    'weapon-modifiers-update',
    'weapon-modifiers-attackBonuses',
    'weapon-modifiers-attackSpecials',
    'range-calculateWeaponRange-melee',
    'range-calculateWeaponRange-noWeapon',
] as const;

type FlowName = (typeof RULE_PROGRESSION_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeRules(page: Page): Promise<{ results: FlowResult[] }> {
    const pushTheLimitUuid = compendiumUuid({ line: 'dh2', category: 'talents' }, 'nmjVhqTarVFg891j');
    const results = await page.evaluate(async (pushUuid: string): Promise<FlowResult[]> => {
        type ImportError = { __importError?: string };
        interface XenosFeaturesModule extends ImportError {
            RIGHT_STUFF?: { applicableSkills?: readonly string[] };
        }
        /** A situational skill row on a compendium talent (#101 moved Push the Limit's terms here). */
        interface SituationalSkillRow {
            key?: string;
            value?: number;
            oncePerRound?: boolean;
            failureConsequence?: { minDof?: number; tableUuid?: string };
        }
        interface TalentDoc {
            system?: { modifiers?: { situational?: { skills?: SituationalSkillRow[] } } };
        }
        interface TrainingCheckResult {
            trained?: boolean;
            talent?: { name: string } | null;
        }
        interface SyntheticActor {
            items: Array<{ type: string; name: string }>;
        }
        interface SyntheticWeapon {
            system: { requiredTraining: string; special: Set<string> };
        }
        interface WeaponTrainingModule extends ImportError {
            checkWeaponTraining?: (actor: SyntheticActor, weapon: SyntheticWeapon) => TrainingCheckResult;
            getWeaponTrainingModifier?: (actor: SyntheticActor, weapon: SyntheticWeapon) => number;
            getWeaponTrainingDescription?: (actor: SyntheticActor, weapon: SyntheticWeapon) => string;
        }
        interface WeaponModifierRollData {
            weapon: { items: never[]; isRanged?: boolean; isMelee?: boolean; system?: Record<string, never> } | undefined;
            weaponModifications?: never[];
            weaponModifiers?: Record<string, number>;
            modifiers: Record<string, number>;
            attackSpecials?: Array<{ name: string }>;
            action?: string;
        }
        interface WeaponModifiersModule extends ImportError {
            updateWeaponModifiers?: (rollData: WeaponModifierRollData) => void;
            calculateWeaponModifiersAttackBonuses?: (rollData: WeaponModifierRollData) => void;
            calculateWeaponModifiersAttackSpecials?: (rollData: WeaponModifierRollData) => void;
        }
        interface RangeRollData {
            weapon: { isMelee?: boolean; system?: Record<string, never> } | undefined;
            distance: number;
            modifiers: Record<string, number>;
            hasWeaponModification: () => boolean;
            hasAttackSpecial: () => boolean;
            /** The attacker's chosen firing options (selectable qualities), as on WeaponRollData. */
            chosenQualities: string[];
            rangeName?: string;
            maxRange?: number;
        }
        interface RangeModule extends ImportError {
            calculateWeaponRange?: (rollData: RangeRollData) => void;
        }

        const out: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            out.push({ name, ok, detail });
        };

        const base = `${'/systems/wh40k-rpg'}/module/rules`;
        const loadModule = async <T extends ImportError>(name: string): Promise<T> => {
            try {
                return (await import(`${base}/${name}.js`)) as T;
            } catch (err) {
                return { __importError: String((err as Error).message) } as T;
            }
        };

        // ---------- content registries (xenos) ----------
        async function probeContentRegistries(): Promise<void> {
            // ---------- xenos-features ----------
            const xenos = await loadModule<XenosFeaturesModule>('xenos-features');
            if (xenos.__importError !== undefined) {
                record('xenos-features-constants', false, String(xenos.__importError));
            } else {
                try {
                    const rightStuff = xenos.RIGHT_STUFF ?? {};
                    // Push the Limit's +20 Operate, once-per-round limit and 4+ DoF critical are
                    // row data on the compendium talent now (#101), not constants in this module.
                    const pushTalent = (await fromUuid(pushUuid)) as TalentDoc | null;
                    const operate = pushTalent?.system?.modifiers?.situational?.skills?.find((row) => row.key === 'operate');
                    const pushRowsOk =
                        operate?.value === 20 &&
                        operate.oncePerRound === true &&
                        operate.failureConsequence?.minDof === 4 &&
                        typeof operate.failureConsequence.tableUuid === 'string';
                    record(
                        'xenos-features-constants',
                        Array.isArray(rightStuff.applicableSkills) && rightStuff.applicableSkills.length > 0 && pushRowsOk,
                        `pushTheLimitOperate=${JSON.stringify(operate ?? null)}`,
                    );
                } catch (err) {
                    record('xenos-features-constants', false, String((err as Error).message));
                }
            }
        }

        // ---------- weapon progression (training / modifiers / range) ----------
        async function probeWeaponProgression(): Promise<void> {
            // ---------- weapon-training ----------
            const wt = await loadModule<WeaponTrainingModule>('weapon-training');
            if (wt.__importError !== undefined) {
                for (const k of [
                    'weapon-training-check-noTraining',
                    'weapon-training-check-untrained',
                    'weapon-training-modifier',
                    'weapon-training-description',
                ] as const)
                    record(k, false, String(wt.__importError));
            } else {
                // Synthetic actor: an items array of plain talent-shaped
                // objects. No talent matches "Las", so the untrained
                // branch fires; a weapon with no requiredTraining hits
                // the early "trained: true" branch.
                const actor: SyntheticActor = { items: [{ type: 'talent', name: 'Quick Draw' }] };
                const untrainedWeapon: SyntheticWeapon = { system: { requiredTraining: 'Las', special: new Set<string>() } };
                const freeWeapon: SyntheticWeapon = { system: { requiredTraining: '-', special: new Set<string>() } };
                const checkWeaponTraining = wt.checkWeaponTraining;
                const getWeaponTrainingModifier = wt.getWeaponTrainingModifier;
                const getWeaponTrainingDescription = wt.getWeaponTrainingDescription;
                try {
                    const r = checkWeaponTraining?.(actor, freeWeapon);
                    record('weapon-training-check-noTraining', r?.trained === true && r.talent === null, null);
                } catch (err) {
                    record('weapon-training-check-noTraining', false, String((err as Error).message));
                }
                try {
                    const r = checkWeaponTraining?.(actor, untrainedWeapon);
                    record('weapon-training-check-untrained', r?.trained === false && r.talent === null, null);
                } catch (err) {
                    record('weapon-training-check-untrained', false, String((err as Error).message));
                }
                try {
                    const free = getWeaponTrainingModifier?.(actor, freeWeapon);
                    const untrained = getWeaponTrainingModifier?.(actor, untrainedWeapon);
                    record('weapon-training-modifier', free === 0 && untrained === -20, `free=${String(free)} untrained=${String(untrained)}`);
                } catch (err) {
                    record('weapon-training-modifier', false, String((err as Error).message));
                }
                try {
                    const desc = getWeaponTrainingDescription?.(actor, untrainedWeapon);
                    record('weapon-training-description', typeof desc === 'string' && desc.length > 0, null);
                } catch (err) {
                    record('weapon-training-description', false, String((err as Error).message));
                }
            }

            // ---------- weapon-modifiers ----------
            const wm = await loadModule<WeaponModifiersModule>('weapon-modifiers');
            if (wm.__importError !== undefined) {
                for (const k of ['weapon-modifiers-update', 'weapon-modifiers-attackBonuses', 'weapon-modifiers-attackSpecials'] as const)
                    record(k, false, String(wm.__importError));
            } else {
                // Minimal rollData whose actionItem (weapon) carries an
                // empty item collection: the loop bodies short-circuit and
                // each mutator completes without throwing — the covered
                // outcome for an actor-bound mutator in headless mode.
                const actionItem = { items: [] as never[], isRanged: false };
                const updateWeaponModifiers = wm.updateWeaponModifiers;
                const calculateWeaponModifiersAttackBonuses = wm.calculateWeaponModifiersAttackBonuses;
                const calculateWeaponModifiersAttackSpecials = wm.calculateWeaponModifiersAttackSpecials;
                try {
                    const rollData: WeaponModifierRollData = {
                        weapon: actionItem,
                        weaponModifications: [],
                        modifiers: {},
                        attackSpecials: [],
                        action: 'Standard Attack',
                    };
                    updateWeaponModifiers?.(rollData);
                    record('weapon-modifiers-update', (rollData.weaponModifications ?? []).length === 0, null);
                } catch (err) {
                    record('weapon-modifiers-update', false, String((err as Error).message));
                }
                try {
                    const rollData: WeaponModifierRollData = {
                        weapon: actionItem,
                        weaponModifiers: { stale: 1 },
                        modifiers: {},
                        attackSpecials: [],
                        action: 'Standard Attack',
                    };
                    calculateWeaponModifiersAttackBonuses?.(rollData);
                    // The function resets weaponModifiers to {} before the loop.
                    record('weapon-modifiers-attackBonuses', Object.keys(rollData.weaponModifiers ?? {}).length === 0, null);
                } catch (err) {
                    record('weapon-modifiers-attackBonuses', false, String((err as Error).message));
                }
                try {
                    const rollData: WeaponModifierRollData = {
                        weapon: actionItem,
                        modifiers: {},
                        attackSpecials: [{ name: 'Primitive' }],
                        action: 'Standard Attack',
                    };
                    calculateWeaponModifiersAttackSpecials?.(rollData);
                    record('weapon-modifiers-attackSpecials', Array.isArray(rollData.attackSpecials), null);
                } catch (err) {
                    record('weapon-modifiers-attackSpecials', false, String((err as Error).message));
                }
            }

            // ---------- range ----------
            const range = await loadModule<RangeModule>('range');
            if (range.__importError !== undefined) {
                for (const k of ['range-calculateWeaponRange-melee', 'range-calculateWeaponRange-noWeapon'] as const)
                    record(k, false, String(range.__importError));
            } else {
                const calculateWeaponRange = range.calculateWeaponRange;
                try {
                    // Melee branch: maxRange forced to 1, range bracket = melee,
                    // no Roll formula path. hasWeaponModification short-circuits
                    // because rangeBonus is not negative here.
                    const rollData: RangeRollData = {
                        weapon: { isMelee: true, system: {} },
                        distance: 2,
                        modifiers: { aim: 0 },
                        hasWeaponModification: () => false,
                        hasAttackSpecial: () => false,
                        chosenQualities: [],
                    };
                    calculateWeaponRange?.(rollData);
                    record('range-calculateWeaponRange-melee', rollData.rangeName === 'Melee' && rollData.maxRange === 1, null);
                } catch (err) {
                    record('range-calculateWeaponRange-melee', false, String((err as Error).message));
                }
                try {
                    // No-weapon guard: maxRange resolves to 0, the ranged
                    // calculator still runs with an empty quality set. The
                    // mutator must complete and assign a string rangeName.
                    const rollData: RangeRollData = {
                        weapon: undefined,
                        distance: 5,
                        modifiers: { aim: 0 },
                        hasWeaponModification: () => false,
                        hasAttackSpecial: () => false,
                        chosenQualities: [],
                    };
                    calculateWeaponRange?.(rollData);
                    record('range-calculateWeaponRange-noWeapon', rollData.maxRange === 0 && typeof rollData.rangeName === 'string', null);
                } catch (err) {
                    record('range-calculateWeaponRange-noWeapon', false, String((err as Error).message));
                }
            }
        }

        await probeContentRegistries();
        await probeWeaponProgression();

        return out;
    }, pushTheLimitUuid);
    return { results };
}

test.describe.serial('rules progression surface (Tier B)', () => {
    test('every remaining rules/* progression surface returns without throwing', async ({ page }) => {
        await joinOrSkip(page);

        const probe = await probeRules(page);
        assertFlowResults(probe, RULE_PROGRESSION_FLOWS, { dimension: 'rule-progression.flow', label: 'rules-progression' });
    });
});
