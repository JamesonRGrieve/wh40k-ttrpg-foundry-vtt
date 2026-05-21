/**
 * Deathwatch Vehicle Critical Hit + Repair action handlers (#170 —
 * rites.md §"DAMAGING VEHICLES" Table 4-2, §"REPAIRING VEHICLES").
 *
 * Two `data-action` handlers wired through the actor sheet's
 * `DEFAULT_OPTIONS.actions`:
 *
 *   - `dwVehicleRollCrit` — Rolls 1d10 + over-Integrity on Table 4-2,
 *                           persists the resolved result (lastCritResult
 *                           lives only in the chat card here — see notes
 *                           — but the over-Integrity total stays where
 *                           the resolver already wrote it), and posts a
 *                           chat card with the crit + repair difficulty.
 *   - `dwVehicleRepair`   — Re-posts the repair-test card for the most
 *                           recent crit result. The DataModel does not
 *                           yet persist `lastCritResult`, so this handler
 *                           degrades to a Challenging Tech-Use Test card
 *                           (the median difficulty) when no in-memory
 *                           context is available. A future migration will
 *                           store `lastCritResult` on the actor so the
 *                           repair card always picks the correct row.
 *
 * Each handler:
 *   1. Reads `vehicleIntegrity` + `overIntegrity` from `this.actor.system`.
 *   2. Calls the pure resolver in `~/module/rules/dw-vehicle-crit`.
 *   3. Posts a chat card via `dw-vehicle-crit-chat.hbs`.
 *
 * NO actor-shape assumptions beyond the two DataModel slots contributed
 * by `dw-vehicle-template.ts`. The handler `this` type matches the
 * static-action pattern used elsewhere in the character / NPC sheet: a
 * minimal shape that exposes `actor` (for `update` + chat speaker) and
 * a notify hook for failure messages.
 */
import { t } from '../i18n/t.ts';
import { rollVehicleCrit, repairDifficultyFor, type DwVehicleCritResult, type RepairDifficulty, type RollVehicleCritResult } from '../rules/dw-vehicle-crit.ts';
import type { I18nKey } from '../types/i18n-keys';

/**
 * Minimal `this` shape exposed by sheet static actions. Both
 * CharacterSheet and NpcSheet are valid production callers (a DW
 * vehicle can be either) — the structural duck-type avoids coupling
 * the action module to either sheet class.
 */
export interface DwVehicleActionHost {
    readonly actor: {
        readonly id: string;
        readonly name: string;
        readonly system: {
            vehicleIntegrity: number;
            overIntegrity: number;
        };
    };
    _notify: (type: 'info' | 'warning' | 'error', message: string, options?: Record<string, unknown>) => void;
}

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/dw-vehicle-crit-chat.hbs';

/** Map a resolver result enum to its langpack label key. */
const RESULT_KEY: Record<DwVehicleCritResult, I18nKey> = {
    'minor': 'WH40K.DW.Vehicle.Crit.Result.Minor',
    'mobility': 'WH40K.DW.Vehicle.Crit.Result.Mobility',
    'weapons': 'WH40K.DW.Vehicle.Crit.Result.Weapons',
    'crew': 'WH40K.DW.Vehicle.Crit.Result.Crew',
    'engine': 'WH40K.DW.Vehicle.Crit.Result.Engine',
    'fire': 'WH40K.DW.Vehicle.Crit.Result.Fire',
    'catastrophic-fire': 'WH40K.DW.Vehicle.Crit.Result.CatastrophicFire',
    'hull': 'WH40K.DW.Vehicle.Crit.Result.Hull',
    'cargo': 'WH40K.DW.Vehicle.Crit.Result.Cargo',
    'wrecked': 'WH40K.DW.Vehicle.Crit.Result.Wrecked',
};

/** Map a difficulty enum to its langpack label key. */
const DIFFICULTY_KEY: Record<RepairDifficulty, I18nKey> = {
    routine: 'WH40K.DW.Vehicle.Repair.Difficulty.Routine',
    challenging: 'WH40K.DW.Vehicle.Repair.Difficulty.Challenging',
    hard: 'WH40K.DW.Vehicle.Repair.Difficulty.Hard',
};

/* -------------------------------------------- */
/*  Internal helpers                            */
/* -------------------------------------------- */

interface ChatCardContext {
    gameSystem: 'dw';
    headerKey: I18nKey;
    resultKey: I18nKey;
    rolled: number;
    overIntegrity: number;
    finalRoll: number;
    description: string;
    repairDifficultyKey: I18nKey | null;
    skipRoll: boolean;
}

async function postVehicleChat(host: DwVehicleActionHost, ctx: ChatCardContext): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate signature requires AnyObject; the ChatCardContext interface is structurally compatible
    const html = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, ctx as unknown as Record<string, unknown>);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const payload = { user: game.user.id, content: html, speaker: { alias: host.actor.name } } as unknown as Parameters<typeof ChatMessage.create>[0];
    await ChatMessage.create(payload);
}

function reportFailure(host: DwVehicleActionHost, label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    host._notify('error', `${label}: ${message}`, { duration: 5000 });
    console.error(`${label} error:`, error);
}

/* -------------------------------------------- */
/*  Action: Roll Critical Hit                   */
/* -------------------------------------------- */

/**
 * Roll a Vehicle Critical Hit. The resolver consumes the current
 * `overIntegrity` total off `actor.system`; the handler posts a chat
 * card with the rolled / final values and the implied repair-difficulty
 * tier so the Tech-Marine immediately sees both the result and the
 * Tech-Use modifier they will need.
 */
export async function dwVehicleRollCrit(this: DwVehicleActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const result: RollVehicleCritResult = rollVehicleCrit({
            overIntegrity: this.actor.system.overIntegrity,
        });
        const difficulty = repairDifficultyFor(result.result);
        await postVehicleChat(this, {
            gameSystem: 'dw',
            headerKey: 'WH40K.DW.Vehicle.Crit.Header',
            resultKey: RESULT_KEY[result.result],
            rolled: result.rolled,
            overIntegrity: this.actor.system.overIntegrity,
            finalRoll: result.finalRoll,
            description: result.description,
            repairDifficultyKey: DIFFICULTY_KEY[difficulty],
            skipRoll: false,
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Vehicle.RollCrit'), error);
    }
}

/* -------------------------------------------- */
/*  Action: Repair Test                         */
/* -------------------------------------------- */

/**
 * Post a Repair Test card. The DataModel does not yet persist the most
 * recent crit result, so the difficulty falls back to Challenging (the
 * median tier) when no fresh context is available. The Tech-Marine
 * picks the actual modifier from the previous crit card; this card is
 * a posted reminder, not a re-derivation. A future migration that adds
 * `lastCritResult` to the schema will let this card pick the correct
 * tier automatically.
 */
export async function dwVehicleRepair(this: DwVehicleActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const difficulty: RepairDifficulty = 'challenging';
        await postVehicleChat(this, {
            gameSystem: 'dw',
            headerKey: 'WH40K.DW.Vehicle.Repair.Header',
            resultKey: 'WH40K.DW.Vehicle.RepairTest',
            rolled: 0,
            overIntegrity: this.actor.system.overIntegrity,
            finalRoll: 0,
            description: '',
            repairDifficultyKey: DIFFICULTY_KEY[difficulty],
            skipRoll: true,
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Vehicle.RepairTest'), error);
    }
}
