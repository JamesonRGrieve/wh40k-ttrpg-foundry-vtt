/**
 * @file DamageRollDialog - V2 dialog for damage rolls
 */

import { ActionData } from '../../rolls/action-data.ts';
import type { RollData } from '../../rolls/roll-data.ts';
import { sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring damage rolls.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: BaseRollDialog options are passed through to ApplicationV2 super; no narrower type available
type DamageRollDialogOptions = Record<string, unknown>;

export default class DamageRollDialog extends BaseRollDialog {
    constructor(rollData = {}, options: DamageRollDialogOptions = {}) {
        super(rollData, options);
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['damage-roll'],
        position: {
            width: 300,
        },
        window: {
            // eslint-disable-next-line no-restricted-syntax -- i18n: WH40K localization key resolved at runtime; rule fires on any literal in this position
            title: 'WH40K.Dialog.DamageRollTitle',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/damage-roll-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    override async _performRoll(): Promise<void> {
        const form = this.element.querySelector('form') ?? this.element;

        const actionData = new ActionData();
        actionData.template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';

        this.rollData['damage'] = form.querySelector<HTMLInputElement>('#damage')?.value ?? this.rollData['damage'];
        this.rollData['penetration'] = form.querySelector<HTMLInputElement>('#penetration')?.value ?? this.rollData['penetration'];
        this.rollData['damageType'] = form.querySelector<HTMLInputElement>('[name=damageType]')?.value ?? this.rollData['damageType'];
        this.rollData['pr'] = form.querySelector<HTMLInputElement>('#pr')?.value;
        this.rollData['template'] = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';

        // eslint-disable-next-line no-restricted-syntax -- boundary: rollData is a plain object passed from legacy call sites; RollData type is inferred structurally
        const typedRollData = this.rollData as unknown as RollData;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Roll ctor accepts Record<string, never> for data; rollData is a legacy plain object
        const theRoll = new Roll(this.rollData['damage'] as string, this.rollData as unknown as Record<string, never>);
        typedRollData.roll = theRoll;
        await theRoll.evaluate();

        actionData.rollData = typedRollData;
        await sendActionDataToChat(actionData);

        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a damage roll dialog.
 * @param {object} rollData  The roll data.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: rollData is a plain legacy object passed from call sites; no narrower type available
export function prepareDamageRoll(rollData: Record<string, unknown>): void {
    rollData['dh'] = CONFIG.wh40k;
    const prompt = new DamageRollDialog(rollData);
    void prompt.render({ force: true });
}
