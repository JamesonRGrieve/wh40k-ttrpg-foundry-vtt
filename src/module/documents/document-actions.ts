/**
 * The roll actions a document starts (a weapon attack, a psychic cast, an item's
 * chat card), held in a slot the action managers fill at init.
 *
 * Documents used to import the managers in `actions/`, and the managers import
 * the documents back through the roll layer, so every document sat in an import
 * cycle (dependency-cruiser counts dynamic `import()` as well). Inverting the
 * dependency removes the cycle: a document calls through this slot, and
 * `hooks-manager` registers the managers' handlers at init. This module imports
 * nothing, so it adds no edge back.
 *
 * The parameters are typed `object` because naming the document classes here
 * would put this module in the same cycle. The registered handlers check the
 * concrete classes before they hand the documents on.
 */
export interface DocumentActionHandlers {
    /** Open the attack roll for `weapon`, made by `attacker` (null: the controlled token's actor). No pre-chosen target. */
    performWeaponAttack: (attacker: object | null, weapon: object) => void;
    /** Open the focus power roll for `power`, cast by `caster`. No pre-chosen target. */
    performPsychicCast: (caster: object, power: object) => void;
    /** Post an item's description card to chat. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: the vocalize template payload is the manager's untyped Handlebars context
    sendItemVocalizeChat: (data: Record<string, unknown>) => Promise<void>;
}

let registered: DocumentActionHandlers | null = null;

/** Fill the slot. Called once by `hooks-manager` at init. */
export function registerDocumentActionHandlers(handlers: DocumentActionHandlers): void {
    registered = handlers;
}

/** The registered handlers. Throws before init, when no roll can start anyway. */
export function documentActions(): DocumentActionHandlers {
    if (registered === null) throw new Error('wh40k-rpg | document action handlers used before init registered them');
    return registered;
}
