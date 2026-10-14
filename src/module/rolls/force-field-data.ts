import { type ForceFieldItem, forceFieldOutcome } from '../rules/force-field-protection.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { ActionData } from './action-data.ts';
import { RollData } from './roll-data.ts';
import { postFlattenedInstanceToChat, roll1d100 } from './roll-helpers.ts';

const FORCE_FIELD_CARD = 'systems/wh40k-rpg/templates/chat/force-field-roll-chat.hbs';

/**
 * A force field's protection roll (#645), resolved per RAW by
 * `forceFieldOutcome` (rules/force-field-protection.ts). The roll is unmodified,
 * so the dialog only chooses how it is rolled; the protection rating is the
 * target it shows.
 */
export class ForceFieldRollData extends RollData {
    forceField: ForceFieldItem;
    protectionRating: number;
    /** The overload band's low end (the item's own band, else 01). */
    overloadMin: number;
    /** The overload band's high end: a roll from `overloadMin` to this overloads the field. */
    overloadRating: number;
    overload = false;

    constructor(actor: WH40KBaseActorDocument, forceField: ForceFieldItem) {
        super();
        this.sourceActor = actor;
        this.forceField = forceField;
        this.nameOverride = forceField.name;
        this.protectionRating = forceField.system.protectionRating;
        this.baseTarget = this.protectionRating;
        const band = forceField.system.effectiveOverloadRange;
        this.overloadMin = band.min;
        this.overloadRating = band.max;
    }

    /**
     * Resolve a protection roll's total. The digital roll and a physical roll
     * entered in the dialog both resolve here.
     * @param total  The d100 total.
     */
    resolve(total: number): void {
        const system = this.forceField.system;
        const outcome = forceFieldOutcome(total, { protectionRating: this.protectionRating, checksOverload: (roll) => system.checksOverload(roll) });
        this.success = outcome.protected;
        this.overload = outcome.overload;
    }

    async finalize(): Promise<void> {
        this.roll = await roll1d100();
        this.resolve(this.roll.total ?? 0);
    }
}

/** The force-field roll as the unified roll dialog opens it (#645). */
export class ForceFieldActionData extends ActionData {
    declare rollData: ForceFieldRollData;

    constructor(actor: WH40KBaseActorDocument, forceField: ForceFieldItem) {
        super();
        this.template = FORCE_FIELD_CARD;
        this.rollData = new ForceFieldRollData(actor, forceField);
    }

    /** Mark an overloaded field, then post the protection card. */
    override async performActionAndSendToChat(): Promise<void> {
        const rollData = this.rollData;
        if (rollData.overload) {
            const updated = await rollData.forceField.update({ 'system.state.overloaded': true });
            if (updated !== undefined) rollData.forceField = updated;
        }
        await postFlattenedInstanceToChat(rollData, FORCE_FIELD_CARD, { actor: rollData.sourceActor, extraContext: { actor: rollData.sourceActor } });
    }
}
