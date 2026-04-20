/**
 * @file DamageRollDialog - V2 dialog for damage rolls
 */

import { ActionData } from '../../rolls/action-data.ts';
import { sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring damage rolls.
 */
interface DamageRollDialogOptions extends ApplicationOptions {}

// @ts-expect-error - TS2417 static side inheritance
export default class DamageRollDialog extends BaseRollDialog {
    constructor(rollData = {}, options: DamageRollDialogOptions = {}) {
        super(rollData, options);
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['damage-roll'],
        position: {
            width: 300,
        },
        window: {
            title: 'Damage Roll',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/damage-roll-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    async _performRoll(): Promise<void> {
        const form = this.element.querySelector('form') ?? this.element;

        const actionData = new ActionData();
        actionData.template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';

        this.rollData.damage = form.querySelector('#damage')?.value ?? this.rollData.damage;
        this.rollData.penetration = form.querySelector('#penetration')?.value ?? this.rollData.penetration;
        this.rollData.damageType = form.querySelector('[name=damageType]')?.value ?? this.rollData.damageType;
        this.rollData.pr = form.querySelector('#pr')?.value;
        this.rollData.template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';

        this.rollData.roll = new Roll(this.rollData.damage, this.rollData);
        await this.rollData.roll.evaluate();

        actionData.rollData = this.rollData;
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
export function prepareDamageRoll(rollData) {
    rollData.dh = CONFIG.wh40k;
    const prompt = new DamageRollDialog(rollData);
    prompt.render(true);
}
