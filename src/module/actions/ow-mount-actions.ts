/**
 * Action handler module for the Only War Mounted Combat panel
 * (#159 — Hammer of the Emperor §"MOUNTED COMBAT" /
 * "MOUNT SPECIAL ACTIONS" / "MOUNT TRAITS", hammer.md lines 4046-4260).
 *
 * The exported `owMountedAction` function is registered into the
 * CharacterSheet's `DEFAULT_OPTIONS.actions` map by the orchestrator
 * (see `.integration-staging/159.json`). It is bound such that `this`
 * provides an `actor` reference — the orchestrator either wires the
 * method as `static` on the sheet or proxies via a sheet thunk that
 * supplies `{ actor: this.document }`.
 *
 * The handler:
 *   1. Reads the clicked button's `data-action-id` attribute.
 *   2. Resolves it against `MOUNTED_ACTIONS` via `getMountedAction()`
 *      (throws on unknown id — the catalogue is fixed at four entries).
 *   3. Posts the OW Mount action chat card with the action name,
 *      timing badge, description, and (when present) the cached
 *      mount-link trait list so the table sees which mount traits
 *      could combine with the resolution.
 *
 * Stateless: the action does not roll the mounted-attack modifier
 * itself — the rider's actual to-hit roll still goes through the
 * regular weapon-skill test path, and the GM combines the engine's
 * `applyMountedAttackModifier` output with the result. This handler
 * is the dispatch record, not the attack resolution.
 *
 * Strong-typed throughout; no Record casts on `system` (the
 * `OwMountDeclarations` interface is spliced onto CharacterData via
 * the orchestrator's `declare` block).
 */

import type { MountedOnEntry } from '../data/actor/mixins/ow-mount-template.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { getMountedAction, type MountedAction, type MountedActionId, type MountedActionTiming } from '../rules/ow-mount.ts';
import type { I18nKey } from '../types/i18n-keys';
import { firstSystemId } from '../utils/chat-system-id.ts';

/**
 * Subset of the OW actor `system` shape this handler reads. The full
 * DataModel is much wider; declaring only the field we touch keeps
 * the handler decoupled from CharacterData and lets the orchestrator
 * splice `OwMountDeclarations` in without import cycles.
 */
interface OwMountActorSystem {
    mountedOn: MountedOnEntry | null;
}

export interface OwMountedActionContext {
    actor: WH40KBaseActor & { system: OwMountActorSystem };
}

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/ow-mount-action-chat.hbs';

/** Map action id → langpack key for the action's display name. */
const NAME_KEY: Readonly<Record<MountedActionId, I18nKey>> = Object.freeze({
    'charge': 'WH40K.OW.Mount.Action.Charge',
    'trample': 'WH40K.OW.Mount.Action.Trample',
    'run-down': 'WH40K.OW.Mount.Action.RunDown',
    'mounted-attack': 'WH40K.OW.Mount.Action.MountedAttack',
});

/** Map action id → langpack key for the action's rules-text description. */
const DESCRIPTION_KEY: Readonly<Record<MountedActionId, I18nKey>> = Object.freeze({
    'charge': 'WH40K.OW.Mount.Description.Charge',
    'trample': 'WH40K.OW.Mount.Description.Trample',
    'run-down': 'WH40K.OW.Mount.Description.RunDown',
    'mounted-attack': 'WH40K.OW.Mount.Description.MountedAttack',
});

/** Map action timing enum → langpack key for the timing badge. */
const TIMING_KEY: Readonly<Record<MountedActionTiming, I18nKey>> = Object.freeze({
    full: 'WH40K.OW.Mount.Timing.Full',
    half: 'WH40K.OW.Mount.Timing.Half',
    reaction: 'WH40K.OW.Mount.Timing.Reaction',
});

/**
 * Type guard for the catalogue id space. The four entries are fixed at
 * compile time; anything else on the clicked button is an upstream
 * rendering bug and the handler quietly no-ops.
 */
function isMountedActionId(value: string): value is MountedActionId {
    return value === 'charge' || value === 'trample' || value === 'run-down' || value === 'mounted-attack';
}

/**
 * `data-action="owMountedAction"` handler. See module header for the
 * full flow; `target` is the clicked `<button>` carrying
 * `data-action-id`.
 */
export async function owMountedAction(this: OwMountedActionContext, event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();

    const rawId = target.dataset['actionId'];
    if (rawId === undefined || rawId === '') return;
    if (!isMountedActionId(rawId)) return;

    const action: MountedAction = getMountedAction(rawId);
    const mount = this.actor.system.mountedOn;

    const templateData = {
        gameSystem: 'ow' as const,
        _gameSystemId: firstSystemId(this.actor),
        actionId: action.id,
        actionNameKey: NAME_KEY[action.id],
        descriptionKey: DESCRIPTION_KEY[action.id],
        timingKey: TIMING_KEY[action.timing],
        mount,
    };

    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate signature requires AnyObject; the templateData literal is structurally compatible
    const html = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, templateData as unknown as Record<string, unknown>);
    await postChatCard(html, { speaker: { alias: this.actor.name } });
}
