import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the *third* batch of pure-logic modules under
 * `src/module/rules/*` — the affliction / social / vehicle resolvers
 * (addiction, assistance, characteristic-damage, combat-circumstance-
 * modifiers, disposition, disease, poison, hatred, phenomena-modifier,
 * reinforcement, requisition-test, spray-avoidance, vehicle-actions,
 * vehicle-hazards) that neither `rules-engine.spec.ts` nor
 * `rules-pure-logic.spec.ts` touches. Same rationale as those specs:
 * every module here is at 0% Tier B function coverage because no other
 * Tier B test imports it directly — the system code reaches these
 * resolvers through Actor / Item methods that take other branches in
 * headless mode. This spec dynamic-imports each module and drives its
 * canonical entry points against synthetic inputs so the v8 coverage
 * capture lights up every export.
 *
 * Each flow records `rule-affliction.flow::<name>`. Keys MUST match the
 * RULE_AFFLICTION_FLOWS constant in scripts/e2e-coverage.mjs — that is
 * the coverage denominator and must agree with the recordCoverage keys
 * here.
 */

const RULE_AFFLICTION_FLOWS = [
    'addiction-resolveCheck',
    'addiction-treatmentDays',
    'assistance-bonus',
    'characteristic-damage-atZero',
    'characteristic-damage-effective',
    'characteristic-damage-healed',
    'combat-modifiers-registry',
    'combat-modifiers-sumSelected',
    'disposition-label',
    'disposition-modifier',
    'disease-exposure',
    'disease-dailyTick',
    'poison-exposure',
    'poison-failurePayload',
    'hatred-actorHasHatredFor',
    'phenomena-modifier-compose',
    'reinforcement-callTarget',
    'requisition-test-target',
    'requisition-test-influenceLoss',
    'spray-avoidance-resolve',
    'vehicle-actions-registry',
    'vehicle-hazards-resolveRoll',
    'vehicle-hazards-repairDifficulty',
] as const;

type FlowName = (typeof RULE_AFFLICTION_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeRules(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/rules`;
            const loadModule = async (name: string): Promise<any | null> => {
                try {
                    return await import(`${base}/${name}.js`);
                } catch (err) {
                    return { __importError: String((err as Error)?.message ?? err) };
                }
            };
            const guarded = (name: FlowName, fn: () => boolean): void => {
                try {
                    record(name, fn(), null);
                } catch (err) {
                    record(name, false, String((err as Error)?.message ?? err));
                }
            };
            const fail = (keys: readonly FlowName[], detail: string): void => {
                for (const k of keys) record(k, false, detail);
            };

            // ---------- addiction ----------
            const addiction = await loadModule('addiction');
            if (addiction?.__importError) {
                fail(['addiction-resolveCheck', 'addiction-treatmentDays'], addiction.__importError);
            } else {
                guarded('addiction-resolveCheck', () => {
                    const r = addiction.resolveAddictionCheck({ willpowerTotal: 50, substanceRating: 10, currentTier: 'none' });
                    const floored = addiction.resolveAddictionCheck({ willpowerTotal: 10, substanceRating: 20, currentTier: 'none' });
                    const severe = addiction.resolveAddictionCheck({ willpowerTotal: 40, substanceRating: 10, currentTier: 'severe' });
                    return r.target === 40 && r.nextTierOnFailure === 'mild' && floored.target === 0 && severe.nextTierOnFailure === 'severe';
                });
                guarded('addiction-treatmentDays', () => typeof addiction.getTreatmentClockDays('mild') === 'number' && addiction.ADDICTION_TREATMENT_DAYS !== undefined);
            }

            // ---------- assistance ----------
            const assistance = await loadModule('assistance');
            if (assistance?.__importError) {
                fail(['assistance-bonus'], assistance.__importError);
            } else {
                guarded('assistance-bonus', () => {
                    return (
                        assistance.getAssistanceBonus(0) === 0 &&
                        assistance.getAssistanceBonus(2) === 20 &&
                        assistance.getAssistanceBonus(99) === 20 &&
                        assistance.getAssistanceBonus(5, 5) === 50 &&
                        assistance.DEFAULT_ASSISTANT_CAP === 2
                    );
                });
            }

            // ---------- characteristic-damage ----------
            const charDamage = await loadModule('characteristic-damage');
            if (charDamage?.__importError) {
                fail(['characteristic-damage-atZero', 'characteristic-damage-effective', 'characteristic-damage-healed'], charDamage.__importError);
            } else {
                guarded('characteristic-damage-atZero', () => {
                    const ws = charDamage.getAtZeroEffect('weaponSkill');
                    const tough = charDamage.getAtZeroEffect('toughness');
                    const missing = charDamage.getAtZeroEffect('not-a-characteristic');
                    return ws?.effect === 'cannot-test' && tough?.effect === 'death' && missing === undefined;
                });
                guarded('characteristic-damage-effective', () => charDamage.getEffectiveCharacteristic(40, 10) === 30 && charDamage.getEffectiveCharacteristic(10, 50) === 0);
                guarded('characteristic-damage-healed', () => charDamage.getCharacteristicDamageHealed(5, 3) === 3 && charDamage.getCharacteristicDamageHealed(2, 10) === 2);
            }

            // ---------- combat-circumstance-modifiers ----------
            const ccm = await loadModule('combat-circumstance-modifiers');
            if (ccm?.__importError) {
                fail(['combat-modifiers-registry', 'combat-modifiers-sumSelected'], ccm.__importError);
            } else {
                guarded('combat-modifiers-registry', () => {
                    const reg = ccm.COMBAT_CIRCUMSTANCE_MODIFIERS;
                    if (!Array.isArray(reg) || reg.length === 0) return false;
                    const first = reg[0];
                    const byId = ccm.getCombatModifier(first.id);
                    const missing = ccm.getCombatModifier('does-not-exist');
                    return byId?.id === first.id && missing === undefined && Array.isArray(ccm.getCombatModifiersForTarget('bs'));
                });
                guarded('combat-modifiers-sumSelected', () => {
                    const reg = ccm.COMBAT_CIRCUMSTANCE_MODIFIERS;
                    const ids = reg.slice(0, 2).map((m: any) => m.id);
                    const sum = ccm.sumSelectedCombatModifiers(ids);
                    const empty = ccm.sumSelectedCombatModifiers([]);
                    return typeof sum === 'number' && empty === 0;
                });
            }

            // ---------- disposition ----------
            const disposition = await loadModule('disposition');
            if (disposition?.__importError) {
                fail(['disposition-label', 'disposition-modifier'], disposition.__importError);
            } else {
                guarded('disposition-label', () => {
                    return (
                        disposition.labelForDisposition(-3) === 'Hostile' &&
                        disposition.labelForDisposition(0) === 'Neutral' &&
                        disposition.labelForDisposition(99) === 'Helpful' &&
                        Array.isArray(disposition.DISPOSITION_LABELS) &&
                        disposition.DISPOSITION_LABELS.length === 7
                    );
                });
                guarded('disposition-modifier', () => disposition.getDispositionModifier(2, 'charm') === 20 && disposition.getDispositionModifier(2, 'intimidate') === -20 && disposition.getDispositionModifier(99, 'charm') === 30);
            }

            // ---------- disease ----------
            const disease = await loadModule('disease');
            if (disease?.__importError) {
                fail(['disease-exposure', 'disease-dailyTick'], disease.__importError);
            } else {
                const profile = { id: 'redfly-plague', label: 'Redfly Plague', rating: 20, damagePerDay: 2, treatmentThreshold: 6 };
                guarded('disease-exposure', () => disease.resolveDiseaseExposure({ toughnessTotal: 50, diseaseRating: 20 }).target === 30 && disease.resolveDiseaseExposure({ toughnessTotal: 10, diseaseRating: 50 }).target === 0);
                guarded('disease-dailyTick', () => {
                    const tick1 = disease.applyInfectionDailyTick({ profile, cumulativeSoFar: 0 });
                    const treated = disease.applyInfectionDailyTick({ profile, cumulativeSoFar: 6, treatmentSucceeded: true });
                    return tick1.damage === 2 && tick1.cumulative === 2 && treated.damage === 0;
                });
            }

            // ---------- poison ----------
            const poison = await loadModule('poison');
            if (poison?.__importError) {
                fail(['poison-exposure', 'poison-failurePayload'], poison.__importError);
            } else {
                const ulva = { id: 'ulva-serum', label: 'Ulva-Serum', rating: 30, failureDamage: 1, ongoingDamagePerRound: 1, ongoingDurationRounds: 5, ongoingTag: 'crippled' };
                guarded('poison-exposure', () => poison.resolvePoisonExposure({ toughnessTotal: 50, poisonRating: 30 }).target === 20 && poison.resolvePoisonExposure({ toughnessTotal: 20, poisonRating: 30 }).target === 0);
                guarded('poison-failurePayload', () => {
                    const p = poison.buildPoisonFailurePayload(ulva);
                    return p.immediateDamage === 1 && p.ongoingDamagePerRound === 1 && p.ongoingDurationRounds === 5 && p.ongoingTag === 'crippled';
                });
            }

            // ---------- hatred ----------
            const hatred = await loadModule('hatred');
            if (hatred?.__importError) {
                fail(['hatred-actorHasHatredFor'], hatred.__importError);
            } else {
                guarded('hatred-actorHasHatredFor', () => {
                    const hatredDaemons = { type: 'talent', name: 'Hatred', system: { specialization: 'Daemons' } };
                    const target = { name: 'Bloodletter', system: { traits: [{ name: 'Daemonic' }] } };
                    const unrelated = { name: 'Guardsman', system: { traits: [] } };
                    const hit = hatred.actorHasHatredFor({ items: [hatredDaemons] }, target);
                    const miss = hatred.actorHasHatredFor({ items: [hatredDaemons] }, unrelated);
                    return hit === 'Daemons' && miss === null && hatred.HATRED_BONUS === 10 && Array.isArray(hatred.HATRED_SPECIALIZATIONS);
                });
            }

            // ---------- phenomena-modifier ----------
            const phenomena = await loadModule('phenomena-modifier');
            if (phenomena?.__importError) {
                fail(['phenomena-modifier-compose'], phenomena.__importError);
            } else {
                guarded('phenomena-modifier-compose', () => {
                    const baseline = phenomena.composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 0 });
                    const warp = phenomena.composePhenomenaModifier({ warpWeakness: true, taintedPsykerPushCP: 0 });
                    const tainted = phenomena.composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 1 });
                    return baseline.focusModifier === 0 && baseline.autoTriggerOnOddOr9 === false && warp.focusModifier === 10 && warp.autoTriggerOnOddOr9 === true && tainted.phenomenaModifier === 5;
                });
            }

            // ---------- reinforcement ----------
            const reinforcement = await loadModule('reinforcement');
            if (reinforcement?.__importError) {
                fail(['reinforcement-callTarget'], reinforcement.__importError);
            } else {
                guarded('reinforcement-callTarget', () => {
                    const standard = reinforcement.getReinforcementCallTarget(40, 'standard');
                    const elite = reinforcement.getReinforcementCallTarget(40, 'elite');
                    return (
                        typeof standard === 'number' &&
                        typeof elite === 'number' &&
                        standard >= elite &&
                        reinforcement.isReinforcementTier('standard') === true &&
                        reinforcement.isReinforcementTier('apprentice') === false &&
                        reinforcement.REINFORCEMENT_MODIFIER.master === -30
                    );
                });
            }

            // ---------- requisition-test ----------
            const requisition = await loadModule('requisition-test');
            if (requisition?.__importError) {
                fail(['requisition-test-target', 'requisition-test-influenceLoss'], requisition.__importError);
            } else {
                guarded('requisition-test-target', () => {
                    const common = requisition.getRequisitionTestTarget({ influence: 40, availability: 'common', craftsmanship: 'common' });
                    const clamped = requisition.getRequisitionTestTarget({ influence: 40, availability: 'rare', craftsmanship: 'best' });
                    const residual = requisition.getRequisitionTestTarget({ influence: 80, availability: 'rare', craftsmanship: 'best' });
                    return common.target === 40 && clamped.target === 0 && residual.target === 30 && requisition.AVAILABILITY_MODIFIERS.ubiquitous === 30;
                });
                guarded('requisition-test-influenceLoss', () => typeof requisition.applyInfluenceLossOnBigFailure(40, 3) === 'number' && requisition.CRAFTSMANSHIP_MODIFIERS.best === -30);
            }

            // ---------- spray-avoidance ----------
            const spray = await loadModule('spray-avoidance');
            if (spray?.__importError) {
                fail(['spray-avoidance-resolve'], spray.__importError);
            } else {
                guarded('spray-avoidance-resolve', () => {
                    const def = spray.resolveSprayAvoidance({ hasLeapingDodge: false, agilityTotal: 40, dodgeTotal: 55 });
                    const leaping = spray.resolveSprayAvoidance({ hasLeapingDodge: true, agilityTotal: 40, dodgeTotal: 55 });
                    const floored = spray.resolveSprayAvoidance({ hasLeapingDodge: false, agilityTotal: -10, dodgeTotal: 30 });
                    return def.skill === 'agility' && def.target === 40 && leaping.skill === 'dodge' && leaping.target === 55 && floored.target === 0;
                });
            }

            // ---------- vehicle-actions ----------
            const vehicleActions = await loadModule('vehicle-actions');
            if (vehicleActions?.__importError) {
                fail(['vehicle-actions-registry'], vehicleActions.__importError);
            } else {
                guarded('vehicle-actions-registry', () => {
                    const names = vehicleActions.getVehicleActionNames();
                    const ram = vehicleActions.getVehicleAction('Ram');
                    const missing = vehicleActions.getVehicleAction('Not An Action');
                    return Array.isArray(names) && names.includes('Ram') && ram?.skill === 'operate' && missing === undefined && Array.isArray(vehicleActions.VEHICLE_ACTIONS);
                });
            }

            // ---------- vehicle-hazards ----------
            const vehicleHazards = await loadModule('vehicle-hazards');
            if (vehicleHazards?.__importError) {
                fail(['vehicle-hazards-resolveRoll', 'vehicle-hazards-repairDifficulty'], vehicleHazards.__importError);
            } else {
                guarded('vehicle-hazards-resolveRoll', () => {
                    const skid = vehicleHazards.resolveHazardRoll('outOfControl', 1);
                    const crash = vehicleHazards.resolveHazardRoll('crash', 10);
                    const fire = vehicleHazards.resolveHazardRoll('onFire', 1);
                    return skid?.label === 'Wide Skid' && crash?.label === 'Catastrophic' && fire?.label === 'Smouldering';
                });
                guarded('vehicle-hazards-repairDifficulty', () => typeof vehicleHazards.getRepairDifficulty(5, 10) === 'number' && typeof vehicleHazards.getRepairDifficulty(1, 10) === 'number');
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rules pure-logic surface — batch 3 (Tier B)', () => {
    test('every affliction / social / vehicle resolver returns the expected value without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRules(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('rule-affliction.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of RULE_AFFLICTION_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${RULE_AFFLICTION_FLOWS.length} rules affliction flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
