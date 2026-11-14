/**
 * What an action needs from the action manager to post its chat cards, held in
 * a slot the manager fills when its module loads (#714).
 *
 * `ActionData` used to import `DHBasicActionManager`, which imports the
 * targeted-action manager, which imports `ActionData` back: the one import cycle
 * that mattered at runtime. An action calls through this slot instead, so the
 * roll layer no longer reaches up into the actions layer. The same inversion as
 * `documents/document-actions.ts`.
 *
 * The parameters are typed with `import type` only, which is erased at compile
 * time and adds no runtime edge.
 */
import type { ActionData } from './action-data.ts';

export interface ActionCardHandlers {
    /** Remember the action so its chat card's buttons can find it again. */
    storeActionData: (action: ActionData) => void;
    /** Roll the action's damage card into chat. */
    postDamageCard: (action: ActionData) => Promise<void>;
}

let registered: ActionCardHandlers | null = null;

/** Fill the slot. Called by `actions/basic-action-manager.ts` as it loads. */
export function registerActionCardHandlers(handlers: ActionCardHandlers): void {
    registered = handlers;
}

/** The registered handlers. Throws if the action manager has not loaded, when no card can post anyway. */
export function actionCardHandlers(): ActionCardHandlers {
    if (registered === null) throw new Error('wh40k-rpg | action card handlers used before the action manager loaded');
    return registered;
}
