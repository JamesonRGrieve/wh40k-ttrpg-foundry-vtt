/**
 * @file SimpleRollDialog - V2 dialog for simple skill/characteristic rolls
 */

import { sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring simple skill or characteristic rolls.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class SimpleRollDialog extends BaseRollDialog {
    constructor(simpleSkillData = {}, options = {}) {
        super(simpleSkillData, options);
        this.simpleSkillData = simpleSkillData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['simple-roll'],
        position: {
            width: 300,
        },
        window: {
            title: 'Roll Modifier',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/simple-roll-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    async _performRoll(): Promise<void> {
        const form = this.element.querySelector('form') ?? this.element;
        const rollData = this.simpleSkillData.rollData;

        const difficultySelect = form.querySelector('#difficulty');
        const modifierInput = form.querySelector('#modifier');

        rollData.modifiers['difficulty'] = parseInt(difficultySelect?.value ?? 0);
        rollData.modifiers['modifier'] = modifierInput?.value ?? 0;

        await rollData.calculateTotalModifiers();
        await this.simpleSkillData.calculateSuccessOrFailure();
        await sendActionDataToChat(this.simpleSkillData);

        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a simple roll dialog.
 * @param {object} simpleSkillData  The skill data.
 */
export function prepareSimpleRoll(simpleSkillData: any): void {
    const prompt = new SimpleRollDialog(simpleSkillData);
    prompt.render(true);
}
