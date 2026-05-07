/**
 * @file SimpleRollDialog - V2 dialog for simple skill/characteristic rolls
 */

import { sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import type { ActionData } from '../../rolls/action-data.ts';
import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring simple skill or characteristic rolls.
 */
type SimpleRollDialogOptions = Record<string, unknown>;

export default class SimpleRollDialog extends BaseRollDialog {
    simpleSkillData: ActionData;

    constructor(simpleSkillData: ActionData, options: SimpleRollDialogOptions = {}) {
        super(simpleSkillData as unknown as Record<string, unknown>, options);
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

        const difficultySelect = form.querySelector('#difficulty') as HTMLSelectElement | null;
        const modifierInput = form.querySelector('#modifier') as HTMLInputElement | null;

        rollData.modifiers['difficulty'] = parseInt(difficultySelect?.value ?? '0');
        rollData.modifiers['modifier'] = parseInt(modifierInput?.value ?? '0');

        await rollData.calculateTotalModifiers();
        await (this.simpleSkillData as unknown as { calculateSuccessOrFailure: () => Promise<void> }).calculateSuccessOrFailure();
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
export function prepareSimpleRoll(simpleSkillData: ActionData) {
    const prompt = new SimpleRollDialog(simpleSkillData);
    prompt.render(true);
}
