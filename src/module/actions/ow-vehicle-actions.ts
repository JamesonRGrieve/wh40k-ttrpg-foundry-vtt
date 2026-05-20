/**
 * Action handler module for the Only War Vehicle Movement panel
 * (#156 — core.md §"VEHICLE MOVEMENT", p.12305).
 *
 * The exported `owVehicleAction` function is registered into the
 * CharacterSheet's `DEFAULT_OPTIONS.actions` map by the orchestrator
 * (see `.integration-staging/156.json`). It is bound such that `this`
 * provides an `actor` reference — the orchestrator either wires the
 * method as `static` on the sheet or proxies via a sheet thunk that
 * supplies `{ actor: this.document }`.
 *
 * The handler:
 *   1. Reads the clicked button's `data-action-id` attribute.
 *   2. Resolves it against `OW_VEHICLE_ACTIONS` via
 *      `getOwVehicleAction()` (throws on unknown id — the catalogue
 *      is fixed at five entries).
 *   3. Posts the OW Vehicle Movement chat card with the action name,
 *      timing badge, description, and (when present) the current
 *      `chaseState` tracker readout.
 *
 * Stateless: the action itself doesn't tick the chase tracker.
 * Pursuer / target driver Operate tests are still rolled by the GM
 * via the regular characteristic-test path; once both DoS/DoF values
 * are known, the GM advances the tracker via `tickHighSpeedChase`
 * (engine module) and writes the next-state value back to
 * `system.chaseState`. The action card is the dispatch record, not
 * the chase resolution.
 *
 * Strong-typed throughout; no Record casts on `system` (the
 * `OwVehicleMovementDeclarations` interface is spliced onto
 * CharacterData + NPCData via the orchestrator's `declare` block).
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { ChaseStateEntry } from '../data/actor/mixins/ow-vehicle-movement-template.ts';
import { getOwVehicleAction, type OwVehicleAction, type OwVehicleActionId, type VehicleActionTiming } from '../rules/ow-vehicle-movement.ts';
import type { I18nKey } from '../types/i18n-keys';

/**
 * Subset of the OW actor `system` shape this handler reads. The full
 * DataModel is much wider; declaring only the field we touch keeps
 * the handler decoupled from CharacterData / NPCData and lets the
 * orchestrator splice `OwVehicleMovementDeclarations` in without
 * import cycles.
 */
interface OwVehicleMovementActorSystem {
    chaseState: ChaseStateEntry | null;
}

export interface OwVehicleActionContext {
    actor: WH40KBaseActor & { system: OwVehicleMovementActorSystem };
}

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/ow-vehicle-action-chat.hbs';

/** Map action id → langpack key for the action's display name. */
const NAME_KEY: Readonly<Record<OwVehicleActionId, I18nKey>> = Object.freeze({
    'evasive-manoeuvring': 'WH40K.OW.VehicleMovement.Action.EvasiveManoeuvring',
    'floor-it': 'WH40K.OW.VehicleMovement.Action.FloorIt',
    'hit-and-run': 'WH40K.OW.VehicleMovement.Action.HitAndRun',
    'jink': 'WH40K.OW.VehicleMovement.Action.Jink',
    'tactical-manoeuvring': 'WH40K.OW.VehicleMovement.Action.TacticalManoeuvring',
});

/** Map action id → langpack key for the action's rules-text description. */
const DESCRIPTION_KEY: Readonly<Record<OwVehicleActionId, I18nKey>> = Object.freeze({
    'evasive-manoeuvring': 'WH40K.OW.VehicleMovement.Description.EvasiveManoeuvring',
    'floor-it': 'WH40K.OW.VehicleMovement.Description.FloorIt',
    'hit-and-run': 'WH40K.OW.VehicleMovement.Description.HitAndRun',
    'jink': 'WH40K.OW.VehicleMovement.Description.Jink',
    'tactical-manoeuvring': 'WH40K.OW.VehicleMovement.Description.TacticalManoeuvring',
});

/** Map action timing enum → langpack key for the timing badge. */
const TIMING_KEY: Readonly<Record<VehicleActionTiming, I18nKey>> = Object.freeze({
    full: 'WH40K.OW.VehicleMovement.Timing.Full',
    half: 'WH40K.OW.VehicleMovement.Timing.Half',
    reaction: 'WH40K.OW.VehicleMovement.Timing.Reaction',
});

/**
 * Type guard for the catalogue id space. The five entries are fixed at
 * compile time; anything else on the clicked button is an upstream
 * rendering bug and the handler quietly no-ops.
 */
function isOwVehicleActionId(value: string): value is OwVehicleActionId {
    return value === 'evasive-manoeuvring' || value === 'floor-it' || value === 'hit-and-run' || value === 'jink' || value === 'tactical-manoeuvring';
}

/**
 * `data-action="owVehicleAction"` handler. See module header for the
 * full flow; `target` is the clicked `<button>` carrying
 * `data-action-id`.
 */
export async function owVehicleAction(this: OwVehicleActionContext, event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();

    const rawId = target.dataset['actionId'];
    if (rawId === undefined || rawId === '') return;
    if (!isOwVehicleActionId(rawId)) return;

    const action: OwVehicleAction = getOwVehicleAction(rawId);
    const chase = this.actor.system.chaseState;

    const templateData = {
        gameSystem: 'ow' as const,
        actionId: action.id,
        actionNameKey: NAME_KEY[action.id],
        descriptionKey: DESCRIPTION_KEY[action.id],
        timingKey: TIMING_KEY[action.timing],
        chase,
    };

    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate signature requires AnyObject; the templateData literal is structurally compatible
    const html = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, templateData as unknown as Record<string, unknown>);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const payload = { user: game.user?.id, content: html, speaker: { alias: this.actor.name } } as unknown as Parameters<typeof ChatMessage.create>[0];
    await ChatMessage.create(payload);
}
