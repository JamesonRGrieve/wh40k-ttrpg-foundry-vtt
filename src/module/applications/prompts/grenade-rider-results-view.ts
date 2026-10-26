/**
 * @file Pure view model for a grenade rider's results card (#623): each creature caught,
 * its test printed as base ± every provenance row = target against the d100, and what the
 * rider did to it — the condition applied for its duration, the effect-roll step, or
 * nothing. Reads no Foundry globals: the words come through {@link GrenadeLabels} and the
 * condition names through `conditionName`, so the card, its story and its tests share it.
 */

import { pluralKey } from '../../i18n/plural.ts';
import type { RiderComponentSource, RiderTargetResult } from '../../rules/grenade-rider-resolution.ts';
import type { I18nKey } from '../../types/i18n-keys';
import type { GrenadeChoice, GrenadeLabels } from './grenade-throw-view.ts';

/** How a creature came out of the rider. */
export type RiderOutcome = 'unaffected' | 'resisted' | 'suffers';

/** One provenance row of a rider test, with its payload for the shared wh40k-tooltip "modifier" type. */
interface RiderComponentRow {
    label: string;
    value: number;
    tooltipData: string;
}

/** One creature caught, as the results card renders it. */
export interface RiderResultRow {
    name: string;
    outcome: RiderOutcome;
    outcomeLabel: string;
    test: { label: string; base: number; roll: number; target: number; degreesLabel: string; components: RiderComponentRow[] } | null;
    /** What the rider did: "Blinded for 3 rounds", "+2 to the effect roll", or '' when nothing landed. */
    effectLabel: string;
    /** Whether the condition was applied to the creature; null when there is no condition to apply. */
    applied: boolean | null;
}

/** The results card's render context. */
export interface RiderResultsCard {
    grenade: string;
    testLabel: string;
    affectsLabel: string;
    effect: string;
    rows: RiderResultRow[];
}

const OUTCOME_LABEL_KEYS: Readonly<Record<RiderOutcome, I18nKey>> = {
    unaffected: 'WH40K.GrenadeRider.Outcome.Unaffected',
    resisted: 'WH40K.GrenadeRider.Outcome.Resisted',
    suffers: 'WH40K.GrenadeRider.Outcome.Suffers',
};

const COMPONENT_LABEL_KEYS: Readonly<Record<RiderComponentSource, I18nKey>> = {
    grenade: 'WH40K.GrenadeRider.Component.Grenade',
    psyker: 'WH40K.GrenadeRider.Component.Psyker',
    damage: 'WH40K.GrenadeRider.Component.DamageSuffered',
};

/** How a creature came out of the rider. */
export function riderOutcome(result: RiderTargetResult): RiderOutcome {
    if (!result.affected) return 'unaffected';
    return result.suffers ? 'suffers' : 'resisted';
}

/** The characteristic damage that landed, as the card states it ("13 Toughness damage"); '' for none. */
function damageLabel(result: RiderTargetResult, labels: GrenadeLabels): string {
    const damage = result.characteristicDamage;
    if (damage === null) return '';
    return labels.localize('WH40K.GrenadeRider.CharacteristicDamage', { amount: damage.amount, characteristic: labels.characteristic(damage.characteristic) });
}

/** The condition (or effect step) that landed; `fallback` states the bare effect when nothing else does. */
function conditionLabel(result: RiderTargetResult, conditionName: string, labels: GrenadeLabels, fallback: boolean): string {
    if (result.condition !== '') {
        if (result.rounds !== null)
            return labels.localize(pluralKey('WH40K.GrenadeRider.ConditionRounds', result.rounds, labels.lang), {
                condition: conditionName,
                rounds: result.rounds,
            });
        if (result.untilEncounterEnd) return labels.localize('WH40K.GrenadeRider.ConditionEncounter', { condition: conditionName });
        return conditionName;
    }
    if (result.effectRollShift > 0) return labels.localize('WH40K.GrenadeRider.EffectShift', { step: `+${result.effectRollShift}` });
    return fallback ? labels.localize('WH40K.GrenadeRider.SuffersEffect') : '';
}

/** What landed on the creature, as the card states it: its condition or effect step, then its characteristic damage. */
function effectLabel(result: RiderTargetResult, conditionName: string, labels: GrenadeLabels): string {
    if (!result.suffers) return '';
    const damage = damageLabel(result, labels);
    const condition = conditionLabel(result, conditionName, labels, damage === '');
    return [condition, damage].filter((part) => part !== '').join('; ');
}

/**
 * The results card for a rider resolved against the creatures caught.
 *
 * @param rider          The grenade's rider as its cards show it.
 * @param results        Each creature's result, in the order caught.
 * @param applied        Per token id, whether its condition was applied (absent: none to apply).
 * @param conditionName  The display name of a condition registry id.
 * @param labels         The langpack and characteristic names.
 * @param characteristic The rider test's characteristic key.
 */
export function buildRiderResultsCard(
    rider: GrenadeChoice,
    results: readonly RiderTargetResult[],
    applied: ReadonlyMap<string, boolean>,
    conditionName: (id: string) => string,
    labels: GrenadeLabels,
    characteristic: string,
): RiderResultsCard {
    const testName = labels.localize('WH40K.GrenadeRider.TestLabel', { characteristic: labels.characteristic(characteristic) });
    return {
        grenade: rider.name,
        testLabel: rider.testLabel,
        affectsLabel: rider.affectsLabel,
        effect: rider.effect,
        rows: results.map((result) => {
            const outcome = riderOutcome(result);
            const test = result.test;
            return {
                name: result.name,
                outcome,
                outcomeLabel: labels.localize(OUTCOME_LABEL_KEYS[outcome]),
                test:
                    test === null
                        ? null
                        : {
                              label: testName,
                              base: test.base,
                              roll: test.roll,
                              target: test.target,
                              degreesLabel: test.passed ? '' : labels.localize('WH40K.GrenadeRider.DegreesOfFailure', { degrees: test.degreesOfFailure }),
                              components: test.components.map((component) => {
                                  const label = labels.localize(COMPONENT_LABEL_KEYS[component.source], {
                                      name: rider.name,
                                      damage: component.damageSuffered ?? 0,
                                  });
                                  return {
                                      label,
                                      value: component.value,
                                      tooltipData: JSON.stringify({ source: component.source, label, value: component.value }),
                                  };
                              }),
                          },
                effectLabel: effectLabel(result, result.condition === '' ? '' : conditionName(result.condition), labels),
                applied: applied.get(result.tokenId) ?? null,
            };
        }),
    };
}
