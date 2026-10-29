/**
 * @file Resolving a Malignancy the character would gain (#91).
 *
 * A failed Malignancy Test draws on the line's Malignancies table. A Mutant with
 * Twisted Flesh (a DH2 supplement) may instead roll on the Mutations
 * table — offered as a choice, since the bonus says "may". Lives in
 * the roll layer and reaches the dialog through the `foundry.applications`
 * global (via `promptItemChoice`), so documents can call it without importing
 * the applications layer.
 */

import type { GameSystemId } from '../config/game-systems/types.ts';
import { t } from '../i18n/t.ts';
import { malignancyOutcomes, type MalignancyOutcome } from '../rules/chaos-backgrounds.ts';
import { RollTableUtils } from '../utils/roll-table-utils.ts';
import { promptItemChoice } from './skill-use-picker.ts';

/** Langpack key naming each outcome on the choice and on the card. */
const MALIGNANCY_OUTCOME_KEYS = {
    malignancy: 'WH40K.Malignancy.TwistedFlesh.TakeMalignancy',
    mutation: 'WH40K.Malignancy.TwistedFlesh.TakeMutation',
} as const satisfies Record<MalignancyOutcome, string>;

/**
 * Which outcome a gained Malignancy takes. With one open outcome it is taken
 * without asking; with Twisted Flesh the player chooses, and dismissing the
 * choice keeps the Malignancy (the bonus is opt-in).
 */
async function chooseMalignancyOutcome(twistedFlesh: boolean): Promise<MalignancyOutcome> {
    const outcomes = malignancyOutcomes(twistedFlesh);
    if (outcomes.length === 1) return 'malignancy';
    const chosen = await promptItemChoice(
        outcomes.map((id) => ({ id, name: t(MALIGNANCY_OUTCOME_KEYS[id]) })),
        t('WH40K.Malignancy.TwistedFlesh.Title'),
        t('WH40K.Malignancy.TwistedFlesh.OutcomeHint'),
    );
    return chosen?.id ?? 'malignancy';
}

/**
 * Resolve a gained Malignancy: choose the outcome, then roll it on the line's
 * own table (Malignancies, or — Twisted Flesh — Mutations).
 */
export async function resolveGainedMalignancy(gameSystem: GameSystemId, twistedFlesh: boolean): Promise<MalignancyOutcome> {
    const outcome = await chooseMalignancyOutcome(twistedFlesh);
    if (outcome === 'mutation') await RollTableUtils.rollMutation(gameSystem);
    else await RollTableUtils.rollMalignancy(gameSystem);
    return outcome;
}
